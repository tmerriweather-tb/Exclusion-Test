import dns from 'node:dns/promises';
import net from 'node:net';
const LIMIT=2_500_000;
const json=(statusCode,data)=>({statusCode,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'},body:JSON.stringify(data)});
function isPublicIP(ip){
 const v=net.isIP(ip);
 if(v===4){const a=ip.split('.').map(Number);return !(a[0]===0||a[0]===10||a[0]===127||a[0]>=224||(a[0]===169&&a[1]===254)||(a[0]===172&&a[1]>=16&&a[1]<=31)||(a[0]===192&&a[1]===168)||(a[0]===100&&a[1]>=64&&a[1]<=127)||(a[0]===192&&a[1]===0)||(a[0]===198&&[18,19].includes(a[1]))||(a[0]===198&&a[1]===51&&a[2]===100)||(a[0]===203&&a[1]===0&&a[2]===113));}
 if(v===6){const s=ip.toLowerCase();return !(s==='::'||s==='::1'||s.startsWith('fc')||s.startsWith('fd')||s.startsWith('fe8')||s.startsWith('fe9')||s.startsWith('fea')||s.startsWith('feb')||s.startsWith('ff')||s.startsWith('::ffff:')||s.startsWith('2001:db8:')||s.startsWith('2001:10:'));}
 return false;
}
async function checkUrl(value){
 const u=new URL(value);
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||!['','80','443'].includes(u.port)||u.hostname.length>253)throw Error('Only public HTTP(S) URLs on standard ports are supported.');
 if(u.hostname==='localhost'||u.hostname.endsWith('.localhost')||u.hostname.endsWith('.local')||u.hostname.endsWith('.internal'))throw Error('Private hosts are not allowed.');
 const ips=net.isIP(u.hostname)?[{address:u.hostname}]:await dns.lookup(u.hostname,{all:true,verbatim:true});
 if(!ips.length||ips.some(x=>!isPublicIP(x.address)))throw Error('Private or reserved network addresses are not allowed.');
 return u;
}
async function fetchPublic(url){
 let current=url;
 for(let i=0;i<4;i++){
  await checkUrl(current);
  const response=await fetch(current,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{'User-Agent':'Mozilla/5.0 (compatible; VenueComplianceReview/1.0)','Accept':'text/html,text/plain,image/*;q=0.8'}});
  if([301,302,303,307,308].includes(response.status)){const loc=response.headers.get('location');if(!loc)throw Error('Redirect without location');current=new URL(loc,current).href;continue;}
  if(!response.ok)throw Error('Source returned HTTP '+response.status);
  if(Number(response.headers.get('content-length')||0)>LIMIT)throw Error('Source is too large');
  const reader=response.body.getReader();let total=0;const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>LIMIT){await reader.cancel();throw Error('Source exceeds size limit');}chunks.push(value);}
  return {type:(response.headers.get('content-type')||'').toLowerCase(),bytes:Buffer.concat(chunks),url:current};
 }
 throw Error('Too many redirects');
}
function extractHtml(html){
 const meta=[];
 for(const m of html.matchAll(/<meta\b[^>]*>/gi)){
  const tag=m[0],name=(tag.match(/(?:name|property)\s*=\s*["']([^"']+)["']/i)||[])[1]||'';
  if(/^(description|keywords|og:title|og:description|twitter:description)$/i.test(name)){
   const content=(tag.match(/content\s*=\s*["']([^"']*)["']/i)||[])[1];if(content)meta.push(content);
  }
 }
 const title=(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'';
 const stripped=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi,' ').replace(/<!--[^]*?-->/g,' ').replace(/<[^>]+>/g,' ');
 const decode=s=>s.replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Math.min(1114111,Number(n))));
 return {text:decode([title,...meta,stripped].join(' ')).replace(/\s+/g,' ').trim().slice(0,20000),meta:{title:decode(title).trim().slice(0,200),description:decode(meta[0]||'').trim().slice(0,400)}};
}
export async function handler(event){
 if(event.httpMethod!=='POST')return json(405,{error:'POST required'});
 let req;try{if((event.body||'').length>10000)throw Error('Too large');req=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Invalid request body'});}
 const websiteUrl=typeof req.websiteUrl==='string'?req.websiteUrl.trim():'';
 const artworkUrl=typeof req.artworkUrl==='string'?req.artworkUrl.trim():'';
 if(!websiteUrl&&!artworkUrl)return json(400,{error:'Provide a website or artwork URL.'});
 const out={website:'',websiteMeta:{},artworkData:'',warnings:[]};
 if(websiteUrl){try{const page=await fetchPublic(websiteUrl);if(!page.type.includes('text/html')&&!page.type.includes('text/plain'))throw Error('Website did not return HTML or plain text');if(page.type.includes('text/html')){const extracted=extractHtml(page.bytes.toString('utf8'));out.website=extracted.text;out.websiteMeta=extracted.meta;}else out.website=page.bytes.toString('utf8').slice(0,20000);if(!out.website)throw Error('No readable website text');}catch(e){out.warnings.push('Website: '+e.message);}}
 if(artworkUrl){
  try{
   let img=await fetchPublic(artworkUrl);
   let source='direct image';
   // Many image-hosting share URLs return an HTML preview page, not image bytes.
   // Resolve only explicit image metadata; never guess arbitrary assets on a page.
   if(img.type.includes('text/html')){
    const html=img.bytes.toString('utf8');
    const metaTags=[...html.matchAll(/<meta\b[^>]*>/gi)].map(m=>m[0]);
    let candidate='';
    for(const tag of metaTags){
     const property=(tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)||[])[1]||'';
     if(!/^(og:image(?::secure_url|:url)?|twitter:image(?::src)?)$/i.test(property))continue;
     const value=(tag.match(/content\s*=\s*["']([^"']+)["']/i)||[])[1];
     if(value){candidate=value.replace(/&amp;/gi,'&');break;}
    }
    if(!candidate)throw Error('Artwork URL opens an HTML preview without a discoverable image. Use a direct image link or upload the file.');
    img=await fetchPublic(new URL(candidate,img.url).href);
    source='image discovered from preview metadata';
   }
   const b=img.bytes;
   let format='';
   if(b.length>=8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))format='png';
   else if(b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255)format='jpeg';
   else if(b.length>=12&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP')format='webp';
   else if(b.length>=6&&['GIF87a','GIF89a'].includes(b.toString('ascii',0,6)))format='gif';
   else if(b.length>=2&&b.toString('ascii',0,2)==='BM')format='bmp';
   if(!format)throw Error('The URL did not return valid PNG, JPG, WEBP, GIF, or BMP image bytes. Upload the artwork file instead.');
   out.artworkData=`data:image/${format};base64,${b.toString('base64')}`;
   out.artworkSource=source;
  }catch(e){out.warnings.push('Artwork: '+e.message);}
 }

 // Return source-specific warnings without failing the entire review. The browser can show manual-review guidance.
 if(!out.website&&!out.artworkData)out.warnings.push('No readable URL content was retrieved. Use artwork upload or enter inquiry text for manual screening.');
 return json(200,out);
}
