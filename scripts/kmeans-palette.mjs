// k-means over real pixels; each centroid snapped to the nearest real pixel coordinate.
import sharp from 'sharp';
const hex=(r,g,b)=>'#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
async function run(file,k,{minAlpha=250,stride=7}={}){
  const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const W=info.width,H=info.height,pts=[];
  for(let y=0;y<H;y+=stride)for(let x=0;x<W;x+=stride){const i=(y*W+x)*4;if(data[i+3]>=minAlpha)pts.push([data[i],data[i+1],data[i+2]])}
  // deterministic kmeans++ init
  let seed=7;const rnd=()=>(seed=(seed*1664525+1013904223)>>>0)/4294967296;
  const cen=[pts[Math.floor(rnd()*pts.length)].slice()];
  const d2=(a,b)=>(a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2;
  while(cen.length<k){const ds=pts.map(p=>Math.min(...cen.map(c=>d2(p,c))));const s=ds.reduce((a,b)=>a+b,0);let t=rnd()*s,j=0;for(;j<ds.length-1;j++){t-=ds[j];if(t<=0)break}cen.push(pts[j].slice())}
  let asg=new Array(pts.length).fill(0);
  for(let it=0;it<40;it++){
    pts.forEach((p,i)=>{let b=0,bd=1e12;cen.forEach((c,j)=>{const d=d2(p,c);if(d<bd){bd=d;b=j}});asg[i]=b});
    const sum=cen.map(()=>[0,0,0,0]);pts.forEach((p,i)=>{const s=sum[asg[i]];s[0]+=p[0];s[1]+=p[1];s[2]+=p[2];s[3]++});
    sum.forEach((s,j)=>{if(s[3])cen[j]=[s[0]/s[3],s[1]/s[3],s[2]/s[3]]});
  }
  const share=cen.map((_,j)=>asg.filter(a=>a===j).length/pts.length);
  // snap to real pixel (full-res scan, alpha>=minAlpha)
  const res=cen.map((c,j)=>({j,share:share[j],c,best:null,bd:1e12}));
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;if(data[i+3]<minAlpha)continue;const p=[data[i],data[i+1],data[i+2]];
    for(const r of res){const d=d2(p,r.c);if(d<r.bd){r.bd=d;r.best={x,y,hex:hex(...p)}}}}
  console.log('\n##',file,'k='+k,'sampled',pts.length);
  res.sort((a,b)=>b.share-a.share).forEach(r=>console.log(`  ${(r.share*100).toFixed(1).padStart(5)}%  centroid ${hex(...r.c.map(Math.round))} -> real pixel ${r.best.hex} @(${r.best.x},${r.best.y})`));
}
await run('brand/LOGO NUSPAD PNG...png',8);
await run('reference/SAMPUL NUSPAD JPG.jpg.jpeg',6,{stride:5});
await run('reference/NUSPAD 1.jpg.jpeg',6,{stride:5});
