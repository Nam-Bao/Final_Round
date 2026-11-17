// So sánh / gộp model v1 với v4 (mức cả ảnh) từ cache .cache/skin-problems-detection-jp4jv_{1,4} (tạo bằng evaluate.js --model ...). Không gọi API.
// node scripts/ensemble_eval.js
const fs=require('fs'),path=require('path');
const R=path.join(__dirname,'..');
const pp=require(R+'/services/postprocess');const cfg=pp.config;
const grp=n=>cfg.classes[String(n).trim().toLowerCase()]?.group;
function rows(split){const coco=JSON.parse(fs.readFileSync(`${R}/data/${split}/${split}.json`));const cats=Object.fromEntries(coco.categories.map(c=>[c.id,c.name]));
 const leak=new Set(JSON.parse(fs.readFileSync(`${R}/scripts/leakage/leak-${split}.json`)).pairs.filter(p=>p.corr>=0.97).map(p=>p.a));
 const truth={};coco.annotations.forEach(a=>{(truth[a.image_id]||=new Set()).add(grp(cats[a.category_id]))});
 const out=[];for(const im of coco.images){if(leak.has(im.file_name))continue;const f4=`${R}/.cache/skin-problems-detection-jp4jv_4/${im.file_name}.json`,f1=`${R}/.cache/skin-problems-detection-jp4jv_1/${im.file_name}.json`;if(!fs.existsSync(f4)||!fs.existsSync(f1))continue;
  const c4=JSON.parse(fs.readFileSync(f4)),c1=JSON.parse(fs.readFileSync(f1));
  const it=pp.postprocess(c4.preds,c4.sent.w,c4.sent.h,'g2',{minConf:cfg.fetchConf,useMaxArea:true,dropDisabled:true});
  const m4=g=>it.filter(i=>i.cls===g).reduce((m,i)=>Math.max(m,i.conf),0);
  const m1=cls=>c1.preds.filter(p=>cls.includes(p.class)).reduce((m,p)=>Math.max(m,p.confidence*100),0);
  out.push({t:truth[im.id]||new Set(),v4:{comedone:m4('comedone'),inflammatory:m4('inflammatory')},v1:{comedone:m1(['blackhead','whitehead']),inflammatory:m1(['papules'])}})}return out}
const F=(rs,g,pred)=>{let tp=0,fp=0,fn=0;rs.forEach(r=>{const t=r.t.has(g),p=pred(r);if(t&&p)tp++;else if(p)fp++;else if(t)fn++});const P=tp/(tp+fp||1),Rc=tp/(tp+fn||1);return 2*P*Rc/(P+Rc||1)};
const V=rows('valid'),T=rows('test');
for(const g of ['comedone','inflammatory']){const pr=cfg.groups[g].presence;
 console.log(`\n${g}: v4 only valid ${(F(V,g,r=>r.v4[g]>=pr)*100).toFixed(1)} test ${(F(T,g,r=>r.v4[g]>=pr)*100).toFixed(1)}`);
 for(const mode of ['OR','AND','AVG']){let best=null;
  for(let t=20;t<=95;t+=5){const pred=r=>mode==='OR'?(r.v4[g]>=pr||r.v1[g]>=t):mode==='AND'?(r.v4[g]>=pr&&r.v1[g]>=t):((r.v4[g]+r.v1[g])/2>=t);
   const fv=F(V,g,pred);if(!best||fv>best.fv)best={t,fv,ft:F(T,g,pred)}}
  console.log(`  ${mode} ngưỡng v1=${best.t}: valid ${(best.fv*100).toFixed(1)} test ${(best.ft*100).toFixed(1)}`)}}
