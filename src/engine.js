/*
 * Admix calculation engine.
 *
 * Every equation and rule that turns patient details into a dose lives in this file.
 * It is plain JavaScript with no screen code and no global state: each function takes
 * its inputs as arguments and returns its results, so it can be read, audited and
 * tested on its own. The screen (src/template.html) only collects inputs, calls these
 * functions and displays the answers.
 *
 * Units: weight kg, height m (H in cm where stated), age years, volumes ml,
 * doses mg, concentrations c in mg/ml, limits k in mg/kg.
 * The build inserts this file into the page unchanged (token @engine).
 */
var Admix=(function(){
var fl=function(v,d){var m=Math.pow(10,d==null?1:d);return Math.floor(v*m+1e-9)/m};

/* ---------- 1. Lean body weight formulas (H in cm, w in kg) ---------- */
function lbwRaw(f,w,H,male,bmi){switch(f){case"boer":return male?.407*w+.267*H-19.2:.252*w+.473*H-48.3;case"james":return male?1.1*w-128*Math.pow(w/H,2):1.07*w-148*Math.pow(w/H,2);case"hume":return male?.3281*w+.33929*H-29.5336:.29569*w+.41813*H-43.2933;case"peters":return 3.8*.0215*Math.pow(w,.6469)*Math.pow(H,.7236);default:return male?9270*w/(6680+216*bmi):9270*w/(8780+244*bmi)}}
/* Chosen formula f, with a fall back to Janmahasatian if the result is implausible (below 25% of total weight); never above total weight. */
function lbwF(f,w,hm,male,bmi){var H=hm*100,r=lbwRaw(f,w,H,male,bmi);if(!(r>=0.25*w))r=lbwRaw("jan",w,H,male,bmi);return Math.max(0,Math.min(w,r))}

/* ---------- 2. Paediatric BMI centiles (CEN = RCPCH data table, s = "M"/"F", k = "c91"|"c98"|"c996", a = age in years) ---------- */
function cen(CEN,s,k,a){var g=CEN[s][k][a<4?0:1],i;if(a<=g[0][0])return g[0][1];if(a>=g[g.length-1][0])return g[g.length-1][1];for(i=1;i<g.length;i++)if(g[i][0]>=a){var p=g[i-1],q=g[i];return p[1]+(q[1]-p[1])*(a-p[0])/(q[0]-p[0])}}

/* Age in years from the entered value and unit (units only apply in paediatric mode) */
function ageYears(v,unit,PM){v=+v;if(!(v>0))return 0;var u=PM?unit:"y";return v*({d:1/365.25,w:7/365.25,m:1/12,y:1}[u])}

/* ---------- 3. Patient: dosing weight ----------
   i = {w,h,age,male,PM,WM,S,CEN}: weight, height (m or cm), age in years, sex, paediatric mode, manual weight choice, settings, centile data. */
function patient(i){var S=i.S,PM=i.PM,WM=i.WM,CEN=i.CEN,w=+i.w,h=+i.h,age=i.age;if(h>3)h=h/100;var hm=h>0?h:0;if(!(h>=(PM?0.05:0.25)))h=0;
var male=!!i.male,sx=male?"M":"F",bmi=w&&h?w/(h*h):0,lbw=bmi?lbwF(PM?S.lbwP:S.lbw,w,h,male,bmi):0,T=S.bmi,bw=5,wt=w,mode="TBW",tbwOnly=false,band="",cc=null;
if(PM){if(bmi&&age>=2&&age<=20){T=cen(CEN,sx,S.pc,age);bw=T*0.1;cc={c91:cen(CEN,sx,"c91",age),c98:cen(CEN,sx,"c98",age),c996:cen(CEN,sx,"c996",age)};band=bmi>=cc.c996?"severely obese (\u226599.6th)":bmi>=cc.c98?"obese (\u226598th)":bmi>=cc.c91?"overweight (\u226591st)":"below 91st centile"}else{tbwOnly=true;T=1e9}}
if(WM=="lbw"&&lbw>0){wt=lbw;mode="LBW (manual)"}else if(WM=="tbw"){mode=bmi>=T?"TBW (manual)":"TBW"}
else if(bmi>=T){if(S.blend&&bmi<T+bw){wt=w+(lbw-w)*((bmi-T)/bw);mode="Adjusted (TBW\u2192LBW)"}else{wt=lbw;mode="LBW"}}
return{neo:PM&&age>0&&age<=0.2501,w:w,h:h,bmi:bmi,lbw:lbw,wt:wt,mode:mode,ok:w>0&&w<=300,noh:!h,hm:hm,tbwOnly:tbwOnly,thr:(PM&&!tbwOnly)?T:0,band:band,cc:cc,age:age,sx:sx}}

/* ---------- 4. Agent list with limits (neonatal reduction, prilocaine lock-out, expert overrides, custom agents) ---------- */
function agents(BASE,OVR,cu,S,NEO,raw){var f=(NEO&&!raw)?1-Math.min(90,Math.max(0,S.neoRed||0))/100:1,fin=function(v){return typeof v==="number"&&isFinite(v)};
return BASE.map(function(b){var o=OVR[b[0]]||{},k=fin(o.k)&&o.k>=0?o.k:b[3],on=o.on!=null?!!o.on:!!b[5];if(NEO&&!raw&&b[4]=="pr")on=false;return{id:b[0],name:b[1],c:b[2],k:k*f,g:b[4],on:on}}).concat(cu.map(function(c){var inv=!(fin(c.c)&&c.c>0)||!(fin(c.k)&&c.k>=0);return{id:String(c.id),name:String(c.name||"Custom"),c:raw?c.c:(inv?10:c.c),k:(fin(c.k)&&c.k>=0?c.k:0)*(raw?1:f),g:String(c.id),on:!inv&&c.on!==false,cu:1,inv:inv}}))}

/* ---------- 5. Airway lidocaine: free-text parser ---------- */
function lev(a,b){var m=[],i,j;for(i=0;i<=a.length;i++)m[i]=[i];for(j=1;j<=b.length;j++)m[0][j]=j;for(i=1;i<=a.length;i++)for(j=1;j<=b.length;j++)m[i][j]=Math.min(m[i-1][j]+1,m[i][j-1]+1,m[i-1][j-1]+(a[i-1]==b[j-1]?0:1));return m[a.length][b.length]}
var DL=["lidocaine","lignocaine","lidocain","lignocain","xylocaine","xylocain","lidocaina"];
function isL(s){return (s.match(/[a-z]{4,}/g)||[]).some(function(w){return /^(lido|lidc|ligno|lignc|xylo|xyl[oi]c)/.test(w)||DL.some(function(d){return lev(w,d)<=2})})}
function isC(s){return /co[\s\-]?ph|cophen|phenylc|phenylk|co[\s\-]?fen|cofen/.test(s)||(s.match(/[a-z]{7,}/g)||[]).some(function(w){return lev(w,"cophenylcaine")<=3})}
var NW={zero:0,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,fifteen:15,twenty:20,thirty:30,forty:40,fifty:50,half:0.5,one:1};
function prep(t){t=String(t||"");t=t.replace(/(\d),(\d{3})(?!\d)/g,"$1$2").replace(/(\d),(\d{1,2})(?!\d)/g,"$1.$2").replace(/per\s+cent/gi,"percent");return t.replace(/\b(zero|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|half|one(?!\s+(?:nostril|side)))\b/gi,function(m){return NW[m.toLowerCase()]})}
function unit(t){if(!t)return"";if(/^(ml|mls|cc|ccs|mil+i?l?i?t.*)$/.test(t)||/^millil/.test(t)||t=="lm"||(t.length>=2&&t.length<=3&&!/^(mg|mgs|no|in|on|of|at|to|or|and)$/.test(t)&&lev(t,"ml")<=1))return"ml";if(/^(mg|mgs|milligrams?|mgm)$/.test(t))return"mg";if(/^(g|gm|gms|grams?|grammes?)$/.test(t))return"g";if(t=="%"||t=="percent"||t=="pc")return"pct";if(/^spr/.test(t)||(t.length>=4&&(lev(t,"sprays")<=2||lev(t,"squirts")<=2||lev(t,"puffs")<=1||lev(t,"pumps")<=1||lev(t,"actuations")<=2)))return"sp";return""}
function segParse(raw,S){var s=prep(raw).toLowerCase().replace(/×/g,"x").replace(/(\d)([a-z%])/g,"$1 $2").replace(/([a-z%])(\d)/g,"$1 $2"),C=isC(s),L=isL(s)||C;if(!L)return{skip:raw.trim()};
var tk=s.match(/\d+(?:\.\d+)?|[a-z]+|%/g)||[],ml=null,mg=null,pct=null,sp=null,cn=null,fl=[],xm=1,dup=0;
tk.forEach(function(t,i){if(t!="x")return;var a=tk[i+1],b=tk[i-1];if(/^\d/.test(a||"")&&!unit(tk[i+2]))xm=+a;else if(/^\d/.test(b||"")&&/^\d/.test(a||""))xm=+b});
tk.forEach(function(t,i){if(!/^\d/.test(t))return;var n=+t,u=unit(tk[i+1]),nx=tk.slice(i+1,i+4).join(" ");if((u=="ml"&&ml!=null)||(u=="pct"&&pct!=null)||(u=="mg"&&mg!=null&&tk[i+2]!="ml"))dup=1;if(u=="ml"&&ml==null)ml=n;else if(u=="mg"&&tk[i+2]=="ml"&&cn==null)cn=n;else if(u=="mg"&&mg==null)mg=n;else if(u=="g"&&mg==null)mg=n*1000;else if(u=="pct"&&pct==null)pct=n;else if(u=="sp"&&sp==null)sp=n;else if(!u&&tk[i-1]=="x"&&sp==null&&xm==1)sp=n;else if(!u&&/(per|each|every)\s+(nostril|side)/.test(nx)&&sp==null)sp=n});
if(cn!=null&&pct==null)pct=cn/10;
if(sp==null&&ml==null&&mg==null&&xm>1&&(C||pct==10||/xylo/.test(s))){sp=xm;xm=1}
var mult=1,wd=s.match(/[a-z]+/g)||[],nI=[];wd.forEach(function(w,i){if((w.length>=4&&(lev(w,"nostril")<=2||lev(w,"nostrils")<=2))||/^sides?$/.test(w))nI.push(i)});
var bi=wd.some(function(w){return /^bilat/.test(w)||(w.length>=6&&lev(w,"bilateral")<=2)}),each=wd.some(function(w,i){return nI.some(function(j){return Math.abs(i-j)<=2&&i!=j&&(/^(per|each|every|both|bd|bds)$/.test(w)||(w.length>=4&&(lev(w,"each")<=2||lev(w,"both")<=1||lev(w,"every")<=1)))})});
if(bi||each)mult=2;var uni=/unilateral|\b(one|1|single|left|right|lt|rt)\s+(nostril|side)/.test(s)||wd.some(function(w){return w.length>=7&&lev(w,"unilateral")<=2});
var label=raw.trim(),out=0,xs=function(){return xm>1?" × "+xm:""};
if(C){var per=pct||S.cpMg;if(pct&&pct!=5)fl.push("concentration "+pct+"% used");
if(sp!=null){out=sp*mult*per;label="Co-phenylcaine: "+sp+" spray"+(sp==1?"":"s")+(mult==2?" × 2 nostrils":"")+" × "+per+" mg";if(mult==1&&!uni)fl.push("nostril count not stated: counted as TOTAL sprays (double it if per nostril)")}
else if(ml!=null){out=ml*50*xm;label="Co-phenylcaine "+ml+" ml × 50 mg/ml (5%)"+xs()}
else if(mg!=null){out=mg*xm;label="Co-phenylcaine "+mg+" mg lidocaine"+xs()}
else{out=S.cpN*per;label="Co-phenylcaine (amount unstated)";fl.push("assumed "+S.cpN+" sprays total (5 per nostril)")}}
else{if(ml!=null&&pct!=null){out=ml*pct*10*xm;label="Lidocaine "+ml+" ml × "+pct+"%"+xs()}
else if(sp!=null){var ps=pct==10||pct==null?10:pct;out=sp*mult*ps;label="Lidocaine "+sp*mult+" sprays × "+ps+" mg";if(pct==null)fl.push("assumed 10% pump spray (10 mg/spray)");else if(pct!=10)fl.push("assumed 0.1 ml per spray")}
else if(mg!=null){out=mg*xm;label="Lidocaine "+mg+" mg"+xs()}
else if(ml!=null){fl.push("concentration missing: not counted");label="Lidocaine "+ml+" ml (no %)";return{label:label,mg:0,fl:fl,bad:1}}
else{fl.push("no quantity found: not counted");return{label:label,mg:0,fl:fl,bad:1}}}
if(out>3000)fl.push("implausibly large (over 3000 mg): check units");
var warn=0;if(dup){fl.push("more than one amount in this entry: only the first was counted. Separate items with commas.");warn=1}
if(!C&&pct!=null&&mg!=null&&ml==null&&sp==null&&cn==null){fl.push('"mg" given with a % concentration: did you mean ml? Counted as mg.');warn=1}
return{label:label,mg:out,fl:fl,bad:warn}}
var OTH=/bupi|levobup|ropiv|prilo|chloroproc|mepiv|articain|tetracain|cocain|phenyleph|adrenal|epineph|ephedr|emla|ketamin|propofol|fentan|morphin|dexmed|clonid|midazol|atropin|glycopyrr/;
/* Parses the airway text into items (label, mg, flags), skipped entries, other drugs ignored, and the total mg. */
function parseAirway(raw,S){var t=prep(raw),items=[],sk=[],ot=[],last=null;
t.split(/[,;\n+&]|\band\b|\bthen\b|\bplus\b|\bfollowed by\b/i).forEach(function(x){var s0=x.trim();if(!s0)return;var r=segParse(s0,S);
if(r.skip){if(OTH.test(s0.toLowerCase())){ot.push(s0);return}if(/\d/.test(s0)&&last&&!last.C){if(last.r.bad){items.pop();var tx=last.text+" "+s0;r=segParse(tx,S);items.push(r);last={text:tx,r:r,C:last.C};return}
var r2=segParse("lidocaine "+s0,S);if(!r2.skip&&!r2.bad){r2.fl=r2.fl.concat(["drug name not stated: assumed lidocaine"]);items.push(r2);last={text:"lidocaine "+s0,r:r2,C:false};return}}
sk.push(s0);return}
items.push(r);last={text:s0,r:r,C:isC(s0.toLowerCase())}});
var tot=0;items.forEach(function(r){tot+=r.mg});return{items:items,sk:sk,ot:ot,tot:tot}}

/* Airway lidocaine pool: pool = LBW (or TBW if no height) x mg/kg, capped; fr = fraction left; W = weight used for all other doses. */
function airwayPool(P,S,used){var pb=P.lbw||P.w,pool=pb?Math.min(pb*S.lidoCap,S.lidoMax):0,fr=pool?Math.max(0,(pool-used)/pool):1;return{pb:pb,pool:pool,fr:fr,W:P.wt*fr}}

/* ---------- 6. Single agent, pairs, dilution ---------- */
/* Unrounded maximum volume (ml) of agent a for weight W */
function maxMlRaw(W,a){return W*a.k/a.c}
/* Displayed maximum: ml rounded down to 0.1, mg from the rounded ml rounded down to a whole number */
function maxDose(W,a){var ml=fl(W*a.k/a.c,1);return{ml:ml,mg:fl(ml*a.c,0)}}
/* Two agents together: fractions of each limit add to at most 1. mix = largest 1:1 mixture (ml). */
function pairLimits(a,b,W){var m1=maxMlRaw(W,a),m2=maxMlRaw(W,b);return{m1:m1,m2:m2,ok:m1>0&&m2>0,mix:(m1>0&&m2>0)?fl(2*m1*m2/(m1+m2),1):0}}
function fractionUsed(u1,u2,m1,m2){return u1/m1+u2/m2}
/* Chart: point from a typed volume of one agent (src 1 or 2), from a table row (0-10), and the rounded point's fraction of the limit */
function chartFromVolume(src,val,m1,m2){var x,y;if(src==1){x=Math.min(val,m1);y=m2*(1-x/m1)}else{y=Math.min(val,m2);x=m1*(1-y/m2)}return{x:x,y:y}}
function chartFromRow(row,m1,m2){var rf=row/10;return{x:m1*(1-rf),y:m2*rf}}
function chartFraction(x,y,m1,m2,dec){var x1=fl(Math.min(x,m1),dec),y1=fl(Math.min(y,m2),dec);return{x1:x1,y1:y1,fr:x1/m1+y1/m2}}
/* "over by" text for a ratio r = amount / maximum (above 1) */
function overText(r){var x=(r-1)*100;return(x>0&&x<0.5?"<1":Math.round(x))+"%"}
/* Dilution: ml of stock a to make V ml of weaker agent b (mg/ml c), rounded down to 0.1 ml; resulting strength in %; total drug mg */
function dilution(a,b,V){var hf=fl(V*b.c/a.c,1);return{hf:hf,df:Math.round((V-hf)*100)/100,ach:hf*a.c/V/10,tg:b.c/10,total:V*b.c}}

/* ---------- 7. Lipid rescue (LAST): mode "aagbi" or "asra"; weight w; settings S ---------- */
function lastDoses(w,S,mode){var R=Math.round,as=mode=="asra",over=as&&w>70,o={as:as,over:over,cap:R(w*S.cap),dbl:R(w*S.inf*S.mult),inf:R(w*S.inf)};o.b=over?100:as?Math.min(100,R(w*S.bolus)):R(w*S.bolus);return o}

return{fl:fl,lbwRaw:lbwRaw,lbwF:lbwF,cen:cen,ageYears:ageYears,patient:patient,agents:agents,parseAirway:parseAirway,airwayPool:airwayPool,
maxMlRaw:maxMlRaw,maxDose:maxDose,pairLimits:pairLimits,fractionUsed:fractionUsed,chartFromVolume:chartFromVolume,chartFromRow:chartFromRow,chartFraction:chartFraction,
overText:overText,dilution:dilution,lastDoses:lastDoses}
})();
if(typeof module!=="undefined"&&module.exports)module.exports=Admix;
