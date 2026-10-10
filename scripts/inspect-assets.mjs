import fs from 'node:fs'; import path from 'node:path'; import sharp from 'sharp';
const dirs=['brand','reference'];
for(const d of dirs) for(const f of fs.readdirSync(d)){
  const p=path.join(d,f); const b=fs.readFileSync(p);
  const isPng=b.slice(0,8).toString('hex')==='89504e470d0a1a0a';
  let hdr='';
  if(isPng){ // IHDR
    hdr=`PNG IHDR w=${b.readUInt32BE(16)} h=${b.readUInt32BE(20)} bitdepth=${b[24]} colourtype=${b[25]} interlace=${b[28]}`;
    // list chunks
    let o=8,ch=[];while(o<b.length){const l=b.readUInt32BE(o);ch.push(b.toString('latin1',o+4,o+8));o+=12+l}
    hdr+=' chunks='+[...new Set(ch)].join(',');
  } else hdr='magic='+b.slice(0,4).toString('hex');
  const m=await sharp(b).metadata();
  console.log('\n##',p,b.length,'bytes\n ',hdr,`\n  sharp: ${m.format} ${m.width}x${m.height} ch=${m.channels} space=${m.space} alpha=${m.hasAlpha}`);
  const {data,info}=await sharp(b).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const hist=new Array(8).fill(0); let pureBlackT=0, n=info.width*info.height;
  for(let i=0;i<n;i++){const a=data[i*4+3];hist[a>>5]++; if(a<255&&data[i*4]===0&&data[i*4+1]===0&&data[i*4+2]===0)pureBlackT++}
  console.log('  alpha histogram (8 bins of 32, 0..255):',hist.map(x=>(100*x/n).toFixed(2)+'%').join(' '));
  console.log('  pure-black pixels with alpha<255:',pureBlackT,'('+(100*pureBlackT/n).toFixed(2)+'%)');
  // dominant quantised colours (opaque only)
  const map=new Map();for(let i=0;i<n;i++){if(data[i*4+3]<200)continue;const k=((data[i*4]>>4)<<8)|((data[i*4+1]>>4)<<4)|(data[i*4+2]>>4);map.set(k,(map.get(k)||0)+1)}
  const top=[...map].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,c])=>`#${[(k>>8)&15,(k>>4)&15,k&15].map(v=>(v*16+8).toString(16).padStart(2,'0')).join('')} ${(100*c/n).toFixed(1)}%`);
  console.log('  dominant (16-level bins):',top.join(' | '));
}
