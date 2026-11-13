import {byId,categories,products} from './data.js';
export const money=n=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n)+' ₸';
export const getSelected=s=>Object.fromEntries(categories.map(c=>[c.id,byId[s?.[c.id]]||null]));
export function totals(s){
 const selected=getSelected(s);const list=Object.values(selected).filter(Boolean);
 const hardware=list.filter(p=>!['monitor','keyboard','mouse','headset'].includes(p.category));
 const accessories=list.filter(p=>['monitor','keyboard','mouse','headset'].includes(p.category));
 return {hardware:hardware.reduce((a,p)=>a+p.price,0),accessories:accessories.reduce((a,p)=>a+p.price,0),total:list.reduce((a,p)=>a+p.price,0),count:list.length};
}
export function powerEstimate(s){const p=getSelected(s);return (p.cpu?.tdp||0)+(p.gpu?.watts||0)+85;}
export function compatibility(s){
 const p=getSelected(s),items=[],add=(level,title,description,parts)=>items.push({level,title,description,parts});
 for(const c of categories.filter(x=>x.required))if(!p[c.id])add('warning',`${c.name} missing`,'Choose a component to complete the core PC build.',[c.id]);
 if(p.cpu&&p.motherboard&&p.cpu.socket!==p.motherboard.socket)add('error','CPU socket mismatch',`${p.cpu.name} requires ${p.cpu.socket}, but the motherboard uses ${p.motherboard.socket}.`,['cpu','motherboard']);
 if(p.ram&&p.motherboard&&p.ram.ramType!==p.motherboard.ramType)add('error','Memory generation mismatch',`${p.motherboard.name} uses ${p.motherboard.ramType}, while the selected kit is ${p.ram.ramType}.`,['ram','motherboard']);
 if(p.case&&p.motherboard&&!p.case.forms.includes(p.motherboard.form))add('error','Motherboard will not fit',`${p.motherboard.form} board is not supported by the chosen case.`,['case','motherboard']);
 if(p.case&&p.gpu&&p.gpu.length>p.case.gpuMax)add('error','Graphics card is too long',`GPU length ${p.gpu.length}mm exceeds the case limit of ${p.case.gpuMax}mm.`,['gpu','case']);
 if(p.case&&p.cooler&&p.cooler.height>p.case.coolerMax)add('error','CPU cooler is too tall',`Cooler height ${p.cooler.height}mm exceeds the case limit of ${p.case.coolerMax}mm.`,['cooler','case']);
 if(p.cpu&&p.cooler&&!p.cooler.sockets.includes(p.cpu.socket))add('error','Cooler mounting mismatch',`Cooler does not list ${p.cpu.socket} mounting support.`,['cpu','cooler']);
 if(p.cpu&&p.cooler&&p.cpu.tdp>p.cooler.cooling)add('warning','Cooling headroom is limited',`CPU power rating (${p.cpu.tdp}W) exceeds the illustrative cooler rating (${p.cooler.cooling}W).`,['cpu','cooler']);
 if(p.psu&&(p.cpu||p.gpu)){
  const watts=powerEstimate(s),required=Math.ceil(watts*1.25/50)*50;
  if(p.psu.watts<watts)add('error','Power supply insufficient',`Estimated peak system draw is ${watts}W, above the PSU's ${p.psu.watts}W rating.`,['psu','gpu','cpu']);
  else if(p.psu.watts<required)add('warning','Low PSU upgrade headroom',`Estimated draw is ${watts}W. Around ${required}W or more is preferred to allow 25% headroom.`,['psu','gpu','cpu']);
 }
 if(p.ram&&p.ram.capacity<32)add('info','Memory upgrade suggestion','32GB is a comfortable target for modern multitasking and demanding gaming.',['ram']);
 if(p.storage&&p.storage.capacity<1000)add('info','Storage upgrade suggestion','A 1TB SSD gives more space for games, apps, and project files.',['storage']);
 const errors=items.filter(x=>x.level==='error').length;
 const warnings=items.filter(x=>x.level==='warning').length;
 return {items,errors,warnings,ok:errors===0&&warnings===0,status:errors?'Incompatible':warnings?'Needs attention':'Looks compatible'};
}
export function alternatives(s,category){
 const original=s[category],baseline=compatibility(s).errors;
 return products.filter(x=>x.category===category&&x.id!==original).map(x=>{
  const next={...s,[category]:x.id},c=compatibility(next),prev=byId[original];
  return {...x,delta:x.price-(prev?.price||0),errors:c.errors,improvement:baseline-c.errors};
 }).sort((a,b)=>a.errors-b.errors||a.price-b.price);
}
export function suggestUpgrade(s,budget){
 const base=totals(s).total,baseline=compatibility(s).errors;
 const preference=['ram','gpu','cpu','storage','monitor','psu','cooler'];
 const valid=[];
 for(const cat of preference){for(const x of alternatives(s,cat)){
  if(x.delta<=0||base+x.delta>budget)continue;
  const current=byId[s[cat]];
  if((x.score??0)<(current?.score??0))continue;
  if(cat==='ram'&&x.capacity<=(current?.capacity||0))continue;
  if(cat==='storage'&&x.capacity<=(current?.capacity||0))continue;
  if(cat==='monitor'&&x.hz<=(current?.hz||0))continue;
  if(cat==='psu'&&x.watts<=(current?.watts||0))continue;
  if(cat==='cooler'&&x.cooling<=(current?.cooling||0))continue;
  if(compatibility({...s,[cat]:x.id}).errors>baseline)continue;
  valid.push({category:cat,product:x,delta:x.delta});
 }}
 return valid.sort((a,b)=>preference.indexOf(a.category)-preference.indexOf(b.category)||a.delta-b.delta)[0]||null;
}
export function parseImport(json){
 let obj=JSON.parse(json);
 if(!obj||typeof obj!=='object'||Array.isArray(obj))throw Error('Invalid configuration format.');
 if(obj.selection)obj=obj.selection;
 const out={};for(const c of categories)out[c.id]=typeof obj[c.id]==='string'&&byId[obj[c.id]]?.category===c.id?obj[c.id]:null;
 return out;
}
