const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "portal.db");
const UPLOADS = process.env.UPLOAD_DIR || path.join(DATA_DIR, "uploads");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 username TEXT UNIQUE NOT NULL,
 password TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('guru','siswa')),
 name TEXT NOT NULL DEFAULT '',
 birth TEXT DEFAULT '',
 address TEXT DEFAULT '',
 bio TEXT DEFAULT '',
 photo TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS materials(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 subject TEXT NOT NULL,
 description TEXT DEFAULT '',
 content TEXT DEFAULT '',
 file_name TEXT DEFAULT '',
 file_path TEXT DEFAULT '',
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 subject TEXT NOT NULL,
 deadline TEXT DEFAULT '',
 description TEXT DEFAULT '',
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS submissions(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 task_id INTEGER NOT NULL,
 student_id INTEGER NOT NULL,
 answer TEXT DEFAULT '',
 file_name TEXT DEFAULT '',
 file_path TEXT DEFAULT '',
 created_at TEXT NOT NULL,
 UNIQUE(task_id, student_id)
);
CREATE TABLE IF NOT EXISTS books(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 author TEXT DEFAULT '',
 category TEXT DEFAULT '',
 url TEXT DEFAULT '',
 created_at TEXT NOT NULL
);
`);

const count = db.prepare("SELECT COUNT(*) c FROM users").get().c;
if (!count) {
  const ins = db.prepare("INSERT INTO users(username,password,role,name) VALUES(?,?,?,?)");
  ins.run("guru", bcrypt.hashSync("guru123", 10), "guru", "Guru");
  ins.run("siswa", bcrypt.hashSync("siswa123", 10), "siswa", "Siswa");
}

app.use(express.json({limit:"2mb"}));
app.use(express.urlencoded({extended:true, limit:"2mb"}));
app.set("trust proxy", 1);
app.use(session({
  secret: process.env.SESSION_SECRET || "dev-only-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly:true, sameSite:"lax", secure: process.env.NODE_ENV === "production", maxAge: 1000*60*60*12 }
}));
app.use("/uploads", express.static(UPLOADS));
app.use(express.static(path.join(ROOT, "public")));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_,__,cb)=>cb(null, UPLOADS),
    filename: (_,file,cb)=>cb(null, Date.now()+"-"+Math.random().toString(36).slice(2)+path.extname(file.originalname))
  }),
  limits: { fileSize: 5 * 1024 * 1024 }
});

function auth(req,res,next){ if(!req.session.user) return res.status(401).json({error:"Belum login"}); next(); }
function requireRole(role){ return (req,res,next)=>{ if(req.session.user?.role!==role) return res.status(403).json({error:"Akses ditolak"}); next(); }; }
function guru(req,res,next){ if(req.session.user?.role!=="guru") return res.status(403).json({error:"Khusus guru"}); next(); }
function safeUser(u){ return {id:u.id,username:u.username,role:u.role,name:u.name,birth:u.birth,address:u.address,bio:u.bio,photo:u.photo}; }
function now(){ return new Date().toISOString(); }

app.get("/health", (req,res)=>res.json({ok:true}));

app.get("/api/me",(req,res)=>res.json({user:req.session.user?safeUser(db.prepare("SELECT * FROM users WHERE id=?").get(req.session.user.id)):null}));

app.post("/api/login",(req,res)=>{
  const u=db.prepare("SELECT * FROM users WHERE username=?").get(String(req.body.username||"").trim().toLowerCase());
  if(!u || !bcrypt.compareSync(String(req.body.password||""),u.password)) return res.status(401).json({error:"Username atau password salah"});
  req.session.user={id:u.id,role:u.role};
  res.json({user:safeUser(u)});
});
app.post("/api/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));

app.get("/api/profile",auth,(req,res)=>res.json(safeUser(db.prepare("SELECT * FROM users WHERE id=?").get(req.session.user.id))));
app.put("/api/profile",auth,(req,res)=>{
  const {name,birth,address,bio}=req.body;
  db.prepare("UPDATE users SET name=?,birth=?,address=?,bio=? WHERE id=?").run(name||"",birth||"",address||"",bio||"",req.session.user.id);
  res.json(safeUser(db.prepare("SELECT * FROM users WHERE id=?").get(req.session.user.id)));
});
app.post("/api/profile/photo",auth,upload.single("photo"),(req,res)=>{
  if(!req.file) return res.status(400).json({error:"Foto tidak ada"});
  const url="/uploads/"+req.file.filename;
  db.prepare("UPDATE users SET photo=? WHERE id=?").run(url,req.session.user.id);
  res.json({photo:url});
});


app.get("/api/students",auth,requireRole("guru"),(req,res)=>{
  const rows=db.prepare("SELECT id,username,name,birth,address,bio,photo FROM users WHERE role='siswa' ORDER BY name,username").all();
  res.json(rows);
});
app.post("/api/students",auth,requireRole("guru"),(req,res)=>{
  const username=String(req.body.username||"").trim().toLowerCase();
  const password=String(req.body.password||"");
  const name=String(req.body.name||"").trim();
  if(!username || !password || !name) return res.status(400).json({error:"Nama, username, dan password wajib diisi"});
  if(username.length<3) return res.status(400).json({error:"Username minimal 3 karakter"});
  if(password.length<6) return res.status(400).json({error:"Password minimal 6 karakter"});
  if(db.prepare("SELECT id FROM users WHERE username=?").get(username)) return res.status(409).json({error:"Username sudah digunakan"});
  const r=db.prepare("INSERT INTO users(username,password,role,name,birth,address,bio) VALUES(?,?,?,?,?,?,?)")
    .run(username,bcrypt.hashSync(password,10),"siswa",name,"","","");
  res.json({id:r.lastInsertRowid,username,name,role:"siswa"});
});
app.put("/api/students/:id",auth,requireRole("guru"),(req,res)=>{
  const id=Number(req.params.id);
  const student=db.prepare("SELECT id FROM users WHERE id=? AND role='siswa'").get(id);
  if(!student) return res.status(404).json({error:"Siswa tidak ditemukan"});
  const name=String(req.body.name||"").trim();
  const password=String(req.body.password||"");
  if(!name) return res.status(400).json({error:"Nama wajib diisi"});
  if(password){
    if(password.length<6) return res.status(400).json({error:"Password minimal 6 karakter"});
    db.prepare("UPDATE users SET name=?,password=? WHERE id=?").run(name,bcrypt.hashSync(password,10),id);
  } else {
    db.prepare("UPDATE users SET name=? WHERE id=?").run(name,id);
  }
  res.json({ok:true});
});
app.delete("/api/students/:id",auth,requireRole("guru"),(req,res)=>{
  const id=Number(req.params.id);
  const student=db.prepare("SELECT id FROM users WHERE id=? AND role='siswa'").get(id);
  if(!student) return res.status(404).json({error:"Siswa tidak ditemukan"});
  db.prepare("DELETE FROM submissions WHERE student_id=?").run(id);
  db.prepare("DELETE FROM users WHERE id=? AND role='siswa'").run(id);
  res.json({ok:true});
});

app.get("/api/materials",auth,(req,res)=>res.json(db.prepare("SELECT * FROM materials ORDER BY id DESC").all()));
app.post("/api/materials",auth,guru,upload.single("file"),(req,res)=>{
  const f=req.file;
  const r=db.prepare(`INSERT INTO materials(title,subject,description,content,file_name,file_path,created_at) VALUES(?,?,?,?,?,?,?)`)
    .run(req.body.title||"",req.body.subject||"Umum",req.body.description||"",req.body.content||"",f?.originalname||"",f?"/uploads/"+f.filename:"",now());
  res.json({id:r.lastInsertRowid});
});
app.delete("/api/materials/:id",auth,guru,(req,res)=>{db.prepare("DELETE FROM materials WHERE id=?").run(req.params.id);res.json({ok:true})});

app.get("/api/tasks",auth,(req,res)=>res.json(db.prepare("SELECT * FROM tasks ORDER BY id DESC").all()));
app.post("/api/tasks",auth,guru,(req,res)=>{
  const r=db.prepare("INSERT INTO tasks(title,subject,deadline,description,created_at) VALUES(?,?,?,?,?)")
    .run(req.body.title||"",req.body.subject||"Umum",req.body.deadline||"",req.body.description||"",now());
  res.json({id:r.lastInsertRowid});
});
app.delete("/api/tasks/:id",auth,guru,(req,res)=>{db.prepare("DELETE FROM tasks WHERE id=?").run(req.params.id);res.json({ok:true})});

app.get("/api/submissions",auth,requireRole("guru"),(req,res)=>{
  let rows;
  if(req.session.user.role==="guru"){
    rows=db.prepare(`SELECT s.*,t.title task_title,u.name student_name,u.username FROM submissions s JOIN tasks t ON t.id=s.task_id JOIN users u ON u.id=s.student_id ORDER BY s.id DESC`).all();
  } else {
    rows=db.prepare(`SELECT s.*,t.title task_title FROM submissions s JOIN tasks t ON t.id=s.task_id WHERE s.student_id=? ORDER BY s.id DESC`).all(req.session.user.id);
  }
  res.json(rows);
});
app.post("/api/submissions",auth,upload.single("file"),(req,res)=>{
  if(req.session.user.role!=="siswa") return res.status(403).json({error:"Khusus siswa"});
  const f=req.file;
  const exists=db.prepare("SELECT id FROM submissions WHERE task_id=? AND student_id=?").get(req.body.task_id,req.session.user.id);
  if(exists) return res.status(409).json({error:"Tugas ini sudah dikirim"});
  const r=db.prepare(`INSERT INTO submissions(task_id,student_id,answer,file_name,file_path,created_at) VALUES(?,?,?,?,?,?)`)
    .run(req.body.task_id,req.session.user.id,req.body.answer||"",f?.originalname||"",f?"/uploads/"+f.filename:"",now());
  res.json({id:r.lastInsertRowid});
});

app.get("/api/my-submissions",auth,requireRole("siswa"),(req,res)=>{
  const rows=db.prepare(`SELECT s.*,t.title task_title FROM submissions s JOIN tasks t ON t.id=s.task_id WHERE s.student_id=? ORDER BY s.id DESC`).all(req.session.user.id);
  res.json(rows);
});

app.get("/api/books",auth,(req,res)=>res.json(db.prepare("SELECT * FROM books ORDER BY id DESC").all()));
app.post("/api/books",auth,guru,(req,res)=>{
  const r=db.prepare("INSERT INTO books(title,author,category,url,created_at) VALUES(?,?,?,?,?)")
    .run(req.body.title||"",req.body.author||"",req.body.category||"Umum",req.body.url||"",now());
  res.json({id:r.lastInsertRowid});
});
app.delete("/api/books/:id",auth,guru,(req,res)=>{db.prepare("DELETE FROM books WHERE id=?").run(req.params.id);res.json({ok:true})});

app.use((req,res)=>res.sendFile(path.join(ROOT,"public","index.html")));
app.listen(PORT,()=>console.log("Portal Kelas berjalan di http://localhost:"+PORT));
