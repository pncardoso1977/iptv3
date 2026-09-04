import express from 'express';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const app=express();
const PORT=process.env.PORT||8080;
const ROOT=process.env.HLS_ROOT||'/var/www/hls';
const TTL=Number(process.env.STREAM_TTL||180);
const ALLOWED_HOSTS=(process.env.ALLOWED_HOSTS||'everywheretv.fun,everywheretvclub.xyz').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
const jobs=new Map();
fs.mkdirSync(ROOT,{recursive:true});
function safeSource(raw){try{const u=new URL(raw);return ['http:','https:'].includes(u.protocol)&&ALLOWED_HOSTS.some(h=>u.hostname===h||u.hostname.endsWith('.'+h));}catch{return false}}
function idFor(source){return crypto.createHash('sha256').update(source).digest('hex').slice(0,24)}
function start(source,id){if(jobs.has(id))return;const dir=path.join(ROOT,id);fs.mkdirSync(dir,{recursive:true});const args=['-hide_banner','-loglevel','warning','-i',source,'-map','0:v:0?','-map','0:a:0?','-c','copy','-f','hls','-hls_time','4','-hls_list_size','8','-hls_flags','delete_segments+append_list','-hls_segment_filename',path.join(dir,'seg_%06d.ts'),path.join(dir,'index.m3u8')];const p=spawn('ffmpeg',args,{stdio:['ignore','ignore','pipe']});const job={p,last:Date.now(),source};jobs.set(id,job);p.stderr.on('data',b=>{job.last=Date.now();console.error(`[${id}] ${b.toString().trim()}`)});p.on('exit',()=>jobs.delete(id));setTimeout(()=>{const j=jobs.get(id);if(j){j.p.kill('SIGTERM');jobs.delete(id)}},TTL*1000)}
app.use((req,res,next)=>{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Range,Content-Type,Accept,Origin');res.setHeader('Access-Control-Expose-Headers','Content-Length,Content-Range,Accept-Ranges,Content-Type');next()});
app.get('/health',(req,res)=>res.json({ok:true,ffmpeg:true}));
app.get('/stream/:id',(req,res)=>{const source=String(req.query.source||'');if(!safeSource(source))return res.status(403).json({error:'Fonte não autorizada'});const id=String(req.params.id).replace(/[^a-zA-Z0-9_-]/g,'');start(source,id);res.redirect(`/hls/${id}/index.m3u8`)});
app.use('/hls',express.static(ROOT,{setHeaders(res,file){if(file.endsWith('.m3u8'))res.setHeader('Content-Type','application/vnd.apple.mpegurl');if(file.endsWith('.ts'))res.setHeader('Content-Type','video/mp2t');res.setHeader('Cache-Control','no-store')}}));
app.listen(PORT,()=>console.log(`EverywhereTV stream relay listening on ${PORT}`));
