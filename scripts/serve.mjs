import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
const root = path.resolve('game');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json'};
const server = http.createServer((req,res)=>{
  let name; try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end();return;}
  const file=path.resolve(root, '.'+(name==='/'?'/index.html':name));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.stat(file,(err,stat)=>{if(err||!stat.isFile()){res.writeHead(404).end('Not found');return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-cache'});fs.createReadStream(file).pipe(res);});
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'Port 5173 is already in use. Open http://localhost:5173 or close the previous server.':error.message);process.exitCode=1;});
server.listen(5173,'0.0.0.0',()=>{console.log('Local: http://localhost:5173');if(process.argv.includes('--open')&&process.platform==='win32')execFile('cmd.exe',['/d','/c','start','','http://localhost:5173'],{windowsHide:true},()=>{});});
