import { useState, useRef, useEffect, useCallback } from "react";

const buildSystemPrompt = (p) => {
  const m={cut:{c:12,p:1,cp:0.35,fp:0.25},lean_bulk:{c:16,p:1,cp:0.40,fp:0.25},recomp:{c:14,p:1.1,cp:0.35,fp:0.28},maintain:{c:15,p:0.9,cp:0.40,fp:0.28}};
  const t=m[p.goal]||m.cut;const cals=Math.round(p.weight*t.c),pro=Math.round(p.weight*t.p),carbs=Math.round((cals*t.cp)/4),fats=Math.round((cals*t.fp)/9);
  const pepWk=p.retaStartDate?Math.max(1,Math.ceil((Date.now()-new Date(p.retaStartDate).getTime())/604800000)):0;
  return `You are APEX — elite AI fitness coach for ${p.name}. ${p.height?`Height: ${p.height}in.`:""} ${p.weight}lbs, ${p.experience} lifter, ${p.trainingDays}d/week.
GOAL: ${p.goal.replace("_"," ")}
PEPTIDE: ${p.peptide&&p.peptide!=="none"?`${p.peptide} ${p.peptideDose}mg, Week ${pepWk}`:"None"}
FOCUS: ${(p.focusAreas||[]).join(", ")||"Overall"} (2x/week)
TARGETS: ${pro}g protein, ${carbs}g carbs, ${fats}g fat, ${cals} cal/day
REST DAYS: ${7-p.trainingDays} per week

MODES:
1. MEALS: Hit targets. Simple meals. Injection day=lighter/low-fat.
2. PANTRY/RECIPE: From ingredients (text or photo), suggest ONE recipe using SOME (not all). Say what you use vs save. Include [MACROS: protein=Xg carbs=Xg fats=Xg cals=X]. Ask "Cook this or something else?"
3. MACRO LOG: When food mentioned: [MACROS: protein=Xg carbs=Xg fats=Xg cals=X] then remaining.
4. WORKOUT LOG: Acknowledge, performance note, recovery tip.
5. ADJUSTMENTS: Stall 2+wk=-100cal/+cardio. Low energy=+carbs.
6. CHECK-IN: weight, energy, performance, effects, sleep then recalibrate.
7. SWAP: Same-macro alt instantly. 8. RESTAURANT: Exact order.
9. SUPPLEMENTS: Creatine 5g, Electrolytes AM, Whey post-workout.
${p.peptide&&p.peptide!=="none"?`
PEPTIDE SAFETY: NEVER auto-recommend dose increases. When bump window approaches, ALWAYS:
1. Ask how they feel first (side effects, energy, appetite)
2. Consider their size (${p.height?Math.round(p.height/12)+"'"+p.height%12+'"':''} ${p.weight}lbs) — smaller people may not need higher doses
3. Show disclaimer: "This is a suggestion based on standard protocol. YOUR body, YOUR call. Consult your provider."
4. Give option to stay at current dose if feeling good
5. List potential side effects of the higher dose`:""}
DO NOT generate workout plans in chat. Workouts are managed in the Train tab.
FORMATTING RULES (CRITICAL):
- NEVER use markdown tables (they break in this app). Use bullet points or inline text instead.
- For remaining macros, write: "Remaining today: Xg protein · Xg carbs · Xg fats · X cal"
- The [MACROS:] tag MUST have plain numbers, NO bold/asterisks inside: [MACROS: protein=38g carbs=32g fats=14g cals=406]
- WRONG: [MACROS: protein=**38g** carbs=**32g**] — this breaks the auto-logger
- Keep responses clean and scannable. Use headers and bullets, not tables.
STYLE: Direct, confident, use ${p.name}'s name. Markdown headers and bullets only. Brief.`;
};

const MODEL="claude-sonnet-4-6";
const NOTIFS=[{time:"07:00",msg:"Rise up. Protein."},{time:"12:00",msg:"Lunch. Hit protein."},{time:"15:30",msg:"Pre-workout fuel."},{time:"17:00",msg:"Gym. No excuses."},{time:"19:30",msg:"Post-workout shake."},{time:"21:00",msg:"Hit your macros?"}];
const LAZY=["Couch is too comfortable. Go lift.","Gym misses you.","Future shredded self is judging you.","Only bad workout is the one that didn't happen.","Someone with worse genetics is in the gym right now."];
const SK="apex4d",CK="apex4c",WPK="apex4w";
const defs=()=>({profile:null,weightHistory:[],macroLog:{},workoutLog:{},notificationsEnabled:false,bumpDismissed:{},dailyChecks:{}});
const QUOTES=["The only person you need to be better than is who you were yesterday.","Discipline is choosing between what you want now and what you want most.","Your body can stand almost anything. It's your mind you have to convince.","The pain you feel today will be the strength you feel tomorrow.","Don't wish for it. Work for it.","Success isn't given. It's earned on the track, on the field, in the gym.","The harder you work, the luckier you get.","Champions aren't made in gyms. Champions are made from something deep inside — a desire, a dream, a vision.","Strive for progress, not perfection.","You don't have to be extreme, just consistent.","The best project you'll ever work on is you.","Motivation gets you started. Habit keeps you going.","It never gets easier. You just get stronger.","Fall in love with the process and the results will come.","Small daily improvements are the key to staggering long-term results."];
const ld=(k,fb)=>{try{return JSON.parse(localStorage.getItem(k))||fb}catch{return fb}};
const sv=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
const todayStr=()=>new Date().toISOString().split("T")[0];
const dayN=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const calcT=(p)=>{if(!p)return{pro:180,carbs:165,fats:62,cals:2100};const m={cut:{c:12,p:1},lean_bulk:{c:16,p:1},recomp:{c:14,p:1.1},maintain:{c:15,p:0.9}};const t=m[p.goal]||m.cut;const cals=Math.round(p.weight*t.c);return{pro:Math.round(p.weight*t.p),carbs:Math.round((cals*0.35)/4),fats:Math.round((cals*0.25)/9),cals}};

const fmt=(text)=>{if(!text)return null;return text.split("\n").map((ln,i)=>{const h=ln.replace(/\*\*(.*?)\*\*/g,'<strong style="color:var(--a)">$1</strong>').replace(/\*(.*?)\*/g,"<em>$1</em>");if(ln.startsWith("### "))return<div key={i}style={{color:"var(--a)",fontSize:"11px",fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",margin:"14px 0 4px",fontFamily:"var(--m)"}}>{ln.slice(4)}</div>;if(ln.startsWith("## "))return<div key={i}style={{color:"var(--a)",fontSize:"13px",fontWeight:700,margin:"16px 0 5px",fontFamily:"var(--m)"}}>{ln.slice(3)}</div>;if(ln.startsWith("# "))return<div key={i}style={{color:"var(--a)",fontSize:"15px",fontWeight:700,margin:"14px 0 6px",fontFamily:"var(--m)"}}>{ln.slice(2)}</div>;if(ln.startsWith("- ")||ln.startsWith("• "))return<div key={i}style={{display:"flex",gap:"7px",margin:"2px 0"}}><span style={{color:"var(--a)",flexShrink:0}}>▹</span><span dangerouslySetInnerHTML={{__html:h.slice(2)}}/></div>;if(/^\d+[\.\)]\s/.test(ln))return<div key={i}style={{margin:"2px 0"}}dangerouslySetInnerHTML={{__html:h}}/>;if(ln.startsWith("---"))return<hr key={i}style={{border:"none",borderTop:"1px solid var(--bd)",margin:"8px 0"}}/>;if(ln.startsWith("[MACROS:")){const mp=ln.replace(/\*\*/g,"").match(/protein=(\d+)g?\s*carbs=(\d+)g?\s*fats=(\d+)g?\s*cals=(\d+)/i);if(mp){const[,p,c,f,cal]=mp;return<div key={i}style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"6px",margin:"8px 0",padding:"10px",background:"rgba(0,255,170,0.04)",border:"1px solid rgba(0,255,170,0.1)",borderRadius:"12px"}}>{[["PRO",p,"var(--a)"],["CARB",c,"#60a5fa"],["FAT",f,"#f97316"],["CAL",cal,"#a78bfa"]].map(([l,v,col])=><div key={l}style={{textAlign:"center"}}><div style={{fontSize:"8px",color:"var(--t4)",fontFamily:"var(--m)",letterSpacing:"0.08em"}}>{l}</div><div style={{fontSize:"16px",fontWeight:700,color:col,fontFamily:"var(--m)"}}>{v}</div><div style={{fontSize:"8px",color:"var(--t4)"}}>g</div></div>)}</div>}return<div key={i}style={{background:"rgba(0,255,170,0.04)",border:"1px solid rgba(0,255,170,0.1)",borderRadius:"10px",padding:"6px 10px",fontSize:"11px",color:"var(--a)",fontFamily:"var(--m)",margin:"6px 0"}}>{ln}</div>}if(!ln.trim())return<div key={i}style={{height:"6px"}}/>;return<div key={i}dangerouslySetInnerHTML={{__html:h}}style={{margin:"2px 0"}}/>;})};

const Bar=({label,cur,max,color,unit="g"})=>{const p=Math.min(100,Math.round((cur/max)*100));return<div style={{marginBottom:"10px"}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px"}}><span style={{fontSize:"10px",color:"var(--t3)",fontFamily:"var(--m)",letterSpacing:"0.06em"}}>{label}</span><span style={{fontSize:"10px",color:cur>max?"#ff4466":"var(--t2)",fontFamily:"var(--m)"}}>{cur}<span style={{color:"var(--t4)"}}>/{max}{unit}</span></span></div><div style={{background:"var(--s2)",borderRadius:"4px",height:"5px",overflow:"hidden"}}><div style={{width:`${p}%`,height:"100%",background:cur>max?"#ff4466":color,borderRadius:"4px",transition:"width 0.4s",boxShadow:`0 0 8px ${color}44`}}/></div></div>};

const WChart=({history})=>{if(history.length<2)return<div style={{textAlign:"center",color:"var(--t4)",fontSize:"11px",padding:"20px"}}>Log 2+ weigh-ins</div>;const vals=history.map(e=>e.weight),lo=Math.min(...vals)-2,hi=Math.max(...vals)+2,rng=hi-lo||1,W=300,H=90,pad=12,pH=H-pad*2,pW=W-pad*2;const pts=history.map((e,i)=>({x:pad+(i/(history.length-1))*pW,y:pad+pH-((e.weight-lo)/rng)*pH}));const line=pts.map(p=>`${p.x},${p.y}`).join(" ");const area=`M${pts[0].x},${H} ${pts.map(p=>`L${p.x},${p.y}`).join(" ")} L${pts[pts.length-1].x},${H} Z`;return<svg width="100%"viewBox={`0 0 ${W} ${H}`}style={{overflow:"visible"}}><defs><linearGradient id="wg"x1="0"y1="0"x2="0"y2="1"><stop offset="0%"stopColor="var(--a)"stopOpacity="0.2"/><stop offset="100%"stopColor="var(--a)"stopOpacity="0"/></linearGradient></defs><path d={area}fill="url(#wg)"/><polyline points={line}fill="none"stroke="var(--a)"strokeWidth="2"strokeLinejoin="round"/>{pts.map((p,i)=><g key={i}><circle cx={p.x}cy={p.y}r="3.5"fill="var(--bg)"stroke="var(--a)"strokeWidth="1.5"/>{(i===0||i===pts.length-1)&&<text x={p.x}y={p.y-9}fill="var(--t3)"fontSize="8"fontFamily="var(--m)"textAnchor="middle">{history[i].weight}</text>}</g>)}</svg>};


// ONBOARDING — with height, peptide status, rest day config
const Onboarding=({onComplete})=>{const[step,setStep]=useState(0);const[d,setD]=useState({name:"",email:"",weight:"",heightFt:"5",heightIn:"10",goal:"cut",peptide:"retatrutide",peptideDose:"1",peptideStatus:"already",weeksIn:"1",experience:"intermediate",trainingDays:5,restDays:2,focusAreas:[],injectionDay:1});
const fOpts=["Shoulders","Back","Chest","Arms","Legs","Glutes","Core"];
const tog=(f)=>setD(p=>({...p,focusAreas:p.focusAreas.includes(f)?p.focusAreas.filter(x=>x!==f):p.focusAreas.length<3?[...p.focusAreas,f]:p.focusAreas}));
const ok=step===0?d.name&&d.weight:step===1?d.goal:step===2?d.focusAreas.length>0:true;
const done=()=>{const weeksAgo=d.peptideStatus==="already"?parseInt(d.weeksIn)||1:0;const startDate=new Date();startDate.setDate(startDate.getDate()-(weeksAgo*7));const totalInches=(parseInt(d.heightFt)||0)*12+(parseInt(d.heightIn)||0);onComplete({...d,weight:parseFloat(d.weight),height:totalInches,peptideDose:parseFloat(d.peptideDose)||0,trainingDays:7-parseInt(d.restDays),restDays:parseInt(d.restDays),retaStartDate:d.peptide!=="none"?startDate.toISOString():null});};
const fS={width:"100%",background:"var(--s)",border:"1px solid var(--bd)",borderRadius:"12px",padding:"14px 16px",color:"var(--t1)",fontSize:"15px",fontFamily:"var(--f)",outline:"none"};
const sS={...fS,appearance:"none"};
return<div style={{minHeight:"100vh",background:"var(--bg)",color:"var(--t1)",fontFamily:"var(--f)",display:"flex",flexDirection:"column",maxWidth:"480px",margin:"0 auto",padding:"0 20px"}}>
<div style={{padding:"40px 0 20px",display:"flex",alignItems:"center",gap:"12px"}}><div style={{width:"44px",height:"44px",background:"var(--a)",borderRadius:"12px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"22px",boxShadow:"0 0 24px rgba(0,255,170,0.35)"}}>⚡</div><div style={{fontFamily:"var(--m)",fontWeight:700,fontSize:"18px",letterSpacing:"0.1em"}}>APEX</div></div>
<div style={{display:"flex",gap:"8px",marginBottom:"30px"}}>{[0,1,2].map(i=><div key={i}style={{height:"3px",flex:1,borderRadius:"2px",background:i<=step?"var(--a)":"var(--s2)",transition:"all .3s",boxShadow:i<=step?"0 0 8px rgba(0,255,170,0.3)":"none"}}/>)}</div>
<div style={{flex:1}}>
{step===0&&<div style={{animation:"sIn .3s"}}><div style={{fontSize:"28px",fontWeight:800,marginBottom:"4px"}}>Welcome to APEX</div><div style={{fontSize:"14px",color:"var(--t3)",marginBottom:"28px"}}>Set up in 30 seconds.</div><div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
<input placeholder="Your name"value={d.name}onChange={e=>setD(p=>({...p,name:e.target.value}))}style={fS}/>
<input placeholder="Email (optional)"type="email"value={d.email}onChange={e=>setD(p=>({...p,email:e.target.value}))}style={fS}/>
<div style={{display:"flex",gap:"10px"}}>
<input placeholder="Weight (lbs)"type="number"value={d.weight}onChange={e=>setD(p=>({...p,weight:e.target.value}))}style={{...fS,flex:1}}/>
<div style={{display:"flex",gap:"6px",flex:1}}>
<select value={d.heightFt}onChange={e=>setD(p=>({...p,heightFt:e.target.value}))}style={{...sS,flex:1}}>{[4,5,6,7].map(ft=><option key={ft}value={ft}>{ft} ft</option>)}</select>
<select value={d.heightIn}onChange={e=>setD(p=>({...p,heightIn:e.target.value}))}style={{...sS,flex:1}}>{[...Array(12)].map((_,i)=><option key={i}value={i}>{i} in</option>)}</select>
</div>
</div>
<select value={d.experience}onChange={e=>setD(p=>({...p,experience:e.target.value}))}style={sS}><option value="beginner">Beginner (0-1 yr)</option><option value="intermediate">Intermediate (1-3 yr)</option><option value="advanced">Advanced (3+ yr)</option></select>
</div></div>}

{step===1&&<div style={{animation:"sIn .3s"}}><div style={{fontSize:"22px",fontWeight:700,marginBottom:"4px"}}>What's your goal?</div><div style={{fontSize:"14px",color:"var(--t3)",marginBottom:"24px"}}>Sets your calorie & macro targets.</div>
<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"20px"}}>{[["cut","🔥 Cut","Lose fat, keep muscle"],["lean_bulk","💪 Lean Bulk","Build muscle"],["recomp","⚡ Recomp","Lose fat & build"],["maintain","🎯 Maintain","Stay steady"]].map(([v,l,s])=><button key={v}onClick={()=>setD(p=>({...p,goal:v}))}style={{background:d.goal===v?"rgba(0,255,170,0.08)":"var(--s)",border:`1px solid ${d.goal===v?"var(--a)":"var(--bd)"}`,borderRadius:"14px",padding:"16px 12px",cursor:"pointer",textAlign:"left",transition:"all .2s"}}><div style={{fontSize:"14px",fontWeight:600,color:d.goal===v?"var(--a)":"var(--t1)"}}>{l}</div><div style={{fontSize:"11px",color:"var(--t4)",marginTop:"2px"}}>{s}</div></button>)}</div>
<div style={{fontSize:"13px",color:"var(--t3)",marginBottom:"10px",fontWeight:600}}>Peptide / Medication</div>
<select value={d.peptide}onChange={e=>setD(p=>({...p,peptide:e.target.value}))}style={{...sS,marginBottom:"10px"}}><option value="retatrutide">Retatrutide</option><option value="semaglutide">Semaglutide</option><option value="tirzepatide">Tirzepatide</option><option value="none">None</option></select>
{d.peptide!=="none"&&<>
<div style={{fontSize:"13px",color:"var(--t3)",marginBottom:"10px",fontWeight:600}}>Where are you in your journey?</div>
<div style={{display:"flex",gap:"8px",marginBottom:"12px"}}>{[["already","Already started"],["starting","Starting fresh"]].map(([v,l])=><button key={v}onClick={()=>setD(p=>({...p,peptideStatus:v}))}style={{flex:1,padding:"12px",borderRadius:"12px",border:`1px solid ${d.peptideStatus===v?"var(--a)":"var(--bd)"}`,background:d.peptideStatus===v?"rgba(0,255,170,0.08)":"var(--s)",color:d.peptideStatus===v?"var(--a)":"var(--t2)",fontSize:"13px",fontWeight:600,cursor:"pointer",transition:"all .2s"}}>{l}</button>)}</div>
{d.peptideStatus==="already"?<div style={{display:"flex",gap:"10px"}}><div style={{flex:1}}><div style={{fontSize:"11px",color:"var(--t4)",marginBottom:"6px"}}>Weeks in</div><select value={d.weeksIn}onChange={e=>setD(p=>({...p,weeksIn:e.target.value}))}style={sS}>{[...Array(24)].map((_,i)=><option key={i+1}value={i+1}>{i+1} wk{i>0?"s":""}</option>)}</select></div><div style={{flex:1}}><div style={{fontSize:"11px",color:"var(--t4)",marginBottom:"6px"}}>Current dose (mg)</div><input type="number"placeholder="1"value={d.peptideDose}onChange={e=>setD(p=>({...p,peptideDose:e.target.value}))}style={fS}/></div></div>
:<div><div style={{fontSize:"11px",color:"var(--t4)",marginBottom:"6px"}}>Starting dose (mg)</div><input type="number"placeholder="1"value={d.peptideDose}onChange={e=>setD(p=>({...p,peptideDose:e.target.value}))}style={{...fS,width:"120px"}}/></div>}
</>}
</div>}

{step===2&&<div style={{animation:"sIn .3s"}}><div style={{fontSize:"22px",fontWeight:700,marginBottom:"4px"}}>Training setup</div><div style={{fontSize:"14px",color:"var(--t3)",marginBottom:"20px"}}>Focus areas get 2x/week volume.</div>
<div style={{display:"flex",flexWrap:"wrap",gap:"10px",marginBottom:"20px"}}>{fOpts.map(f=>{const a=d.focusAreas.includes(f);return<button key={f}onClick={()=>tog(f)}style={{padding:"12px 20px",borderRadius:"30px",border:`1px solid ${a?"var(--a)":"var(--bd)"}`,background:a?"rgba(0,255,170,0.1)":"var(--s)",color:a?"var(--a)":"var(--t2)",fontSize:"14px",fontWeight:600,cursor:"pointer",transition:"all .2s"}}>{f}{a&&" ✓"}</button>})}</div>
<div style={{display:"flex",gap:"10px",marginBottom:"12px"}}>
<div style={{flex:1}}><div style={{fontSize:"11px",color:"var(--t4)",marginBottom:"6px"}}>Rest days per week</div><select value={d.restDays}onChange={e=>setD(p=>({...p,restDays:e.target.value}))}style={sS}><option value={0}>0 (every day)</option><option value={1}>1 rest day</option><option value={2}>2 rest days</option><option value={3}>3 rest days</option></select></div>
{d.peptide!=="none"&&<div style={{flex:1}}><div style={{fontSize:"11px",color:"var(--t4)",marginBottom:"6px"}}>Injection day</div><select value={d.injectionDay}onChange={e=>setD(p=>({...p,injectionDay:parseInt(e.target.value)}))}style={sS}>{dayN.map((n,i)=><option key={i}value={i}>{n}</option>)}</select></div>}
</div>
<div style={{fontSize:"12px",color:"var(--t3)",background:"var(--s)",borderRadius:"12px",padding:"12px",marginTop:"4px"}}>📋 {7-parseInt(d.restDays)} training days + {d.restDays} rest day{parseInt(d.restDays)!==1?"s":""} per week</div>
</div>}
</div>
<div style={{padding:"20px 0 40px",display:"flex",gap:"10px"}}>{step>0&&<button onClick={()=>setStep(s=>s-1)}style={{padding:"16px 24px",borderRadius:"14px",background:"var(--s)",border:"1px solid var(--bd)",color:"var(--t2)",fontSize:"15px",fontWeight:600,cursor:"pointer"}}>Back</button>}<button onClick={()=>step<2?setStep(s=>s+1):done()}disabled={!ok}style={{flex:1,padding:"16px",borderRadius:"14px",background:ok?"var(--a)":"var(--s2)",color:ok?"var(--bg)":"var(--t4)",fontSize:"15px",fontWeight:700,cursor:ok?"pointer":"not-allowed",border:"none",boxShadow:ok?"0 0 28px rgba(0,255,170,0.25)":"none",transition:"all .2s"}}>{step<2?"Continue":"Launch APEX →"}</button></div></div>};

const WDetail=({day,onBack,onDone})=>{const[exp,setExp]=useState(null);if(!day)return null;
const typeColors={"Push":"#f97316","Pull":"#60a5fa","Legs":"#a78bfa","Upper":"#f0ff4b","Lower":"#c084fc","Full":"var(--a)","Rest":"#60a5fa"};
const typeKey=Object.keys(typeColors).find(k=>(day.type||"").includes(k))||"";
const typeColor=typeColors[typeKey]||"var(--a)";
return<div style={{animation:"sIn .3s"}}>
<button onClick={onBack}style={{background:"none",border:"none",color:"var(--a)",fontSize:"13px",cursor:"pointer",fontFamily:"var(--m)",marginBottom:"16px",padding:0,display:"flex",alignItems:"center",gap:"6px"}}>← Calendar</button>
<div style={{marginBottom:"20px"}}>
<div style={{fontSize:"10px",color:"var(--t4)",fontFamily:"var(--m)",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:"4px"}}>{day.day}</div>
<div style={{fontSize:"24px",fontWeight:800,color:typeColor,marginBottom:"4px"}}>{day.type||"Workout"}</div>
<div style={{fontSize:"14px",color:"var(--t2)"}}>{day.subtitle||day.focus||day.description||""}</div>
</div>
{day.isRest?<div style={{...{background:"rgba(96,165,250,0.06)",border:"1px solid rgba(96,165,250,0.12)",borderRadius:"16px",padding:"30px 20px",textAlign:"center"}}}><div style={{fontSize:"36px",marginBottom:"12px"}}>😴</div><div style={{fontSize:"18px",fontWeight:700,color:"#60a5fa",marginBottom:"8px"}}>Rest Day</div><div style={{fontSize:"13px",color:"var(--t3)",lineHeight:1.7}}>{day.subtitle||"Recovery is part of the process. Eat well, sleep well, hydrate."}<br/><br/>Optional: 30-40 min light walk or LISS cardio.</div></div>
:(day.exercises||[]).map((ex,i)=>{
const target=ex.target||ex.muscles||ex.musclesTargeted||ex.primaryMuscles||"";
const mistake=ex.mistake||ex.commonMistake||ex.avoid||ex.error||"";
const tip=ex.tip||ex.coachTip||ex.hint||ex.note||"";
const desc=ex.desc||ex.description||ex.howTo||ex.instructions||"";
return<div key={i}style={{background:"var(--s)",border:"1px solid var(--bd)",borderRadius:"14px",marginBottom:"10px",overflow:"hidden"}}>
<button onClick={()=>setExp(exp===i?null:i)}style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",background:"none",border:"none",cursor:"pointer",textAlign:"left"}}>
<div style={{flex:1}}>
<div style={{fontSize:"14px",fontWeight:600,color:"var(--t1)",marginBottom:"3px"}}>{i+1}. {ex.name||ex.exercise||ex.exerciseName}</div>
<div style={{fontSize:"12px",color:"var(--t3)",fontFamily:"var(--m)"}}>{ex.sets}×{ex.reps} · {ex.rest} rest</div>
</div>
<div style={{fontSize:"11px",color:exp===i?"var(--a)":"var(--t4)",fontFamily:"var(--m)",marginLeft:"8px"}}>{exp===i?"▲":"▼"}</div>
</button>
{exp===i&&<div style={{padding:"0 16px 16px",borderTop:"1px solid var(--bd)",animation:"fadeIn .2s"}}>
<img src={`https://cdn.jefit.com/assets/img/exercises/${(ex.name||"").toLowerCase().replace(/[^a-z0-9]/g,"-")}.gif`} alt="" onError={e=>{e.target.onerror=null;e.target.style.display="none"}} style={{width:"100%",height:"140px",objectFit:"contain",borderRadius:"10px",margin:"12px 0",background:"var(--s2)"}}/>
{desc&&<div style={{fontSize:"13px",color:"var(--t2)",lineHeight:1.7,marginBottom:"12px",paddingTop:"4px"}}>{desc}</div>}
<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
<div style={{background:"rgba(0,255,170,0.05)",borderRadius:"10px",padding:"10px 12px"}}>
<div style={{fontSize:"9px",color:"var(--a)",fontFamily:"var(--m)",letterSpacing:"0.08em",marginBottom:"6px"}}>TARGET</div>
<div style={{fontSize:"12px",color:"var(--t2)",lineHeight:1.5}}>{target||"Primary muscles for this movement"}</div>
</div>
<div style={{background:"rgba(255,68,102,0.05)",borderRadius:"10px",padding:"10px 12px"}}>
<div style={{fontSize:"9px",color:"#ff4466",fontFamily:"var(--m)",letterSpacing:"0.08em",marginBottom:"6px"}}>AVOID</div>
<div style={{fontSize:"12px",color:"var(--t2)",lineHeight:1.5}}>{mistake||"Focus on controlled movement"}</div>
</div>
</div>
{tip&&<div style={{marginTop:"8px",background:"var(--s2)",borderRadius:"10px",padding:"10px 12px",fontSize:"12px",color:"var(--t3)",lineHeight:1.6}}>💡 {tip}</div>}
</div>}
</div>})}
{!day.isRest&&(day.exercises||[]).length>0&&<button onClick={onDone}style={{width:"100%",padding:"16px",borderRadius:"14px",background:"var(--a)",color:"var(--bg)",fontSize:"15px",fontWeight:700,border:"none",cursor:"pointer",marginTop:"8px",boxShadow:"0 0 20px rgba(0,255,170,0.2)"}}>✅ Complete Workout</button>}
</div>};

// BUMP DISCLAIMER
const BumpDisclaimer=({pepWeek,pepDose,nextDose,profile,onDismiss,onStay})=>{
const ht=profile.height?`${Math.floor(profile.height/12)}'${profile.height%12}"`:"";
return<div style={{background:"linear-gradient(135deg,rgba(255,170,0,0.08),rgba(255,100,0,0.04))",border:"1px solid rgba(255,170,0,0.2)",borderRadius:"16px",padding:"18px",marginBottom:"12px"}}>
<div style={{fontSize:"14px",fontWeight:700,color:"#ffaa00",marginBottom:"8px"}}>⚠️ Dose Bump Window</div>
<div style={{fontSize:"13px",color:"var(--t2)",lineHeight:1.7,marginBottom:"12px"}}>
Your protocol suggests moving from <strong style={{color:"var(--a)"}}>{pepDose}mg</strong> to <strong style={{color:"#ffaa00"}}>{nextDose}mg</strong>.
{ht&&` At ${ht}, ${profile.weight}lbs, `}consider how your body has responded so far.</div>
<div style={{fontSize:"12px",color:"var(--t3)",background:"var(--s)",borderRadius:"10px",padding:"12px",marginBottom:"12px",lineHeight:1.6}}>
<strong style={{color:"#ffaa00"}}>Before increasing, ask yourself:</strong><br/>
▹ Any nausea or GI issues at current dose?<br/>
▹ Energy levels stable?<br/>
▹ Appetite suppression manageable?<br/>
▹ Consulted your healthcare provider?<br/><br/>
<em style={{color:"var(--t4)"}}>This is a suggestion based on standard protocol. YOUR body, YOUR call. Smaller individuals may not need higher doses. Always consult your provider.</em>
</div>
<div style={{display:"flex",gap:"8px"}}>
<button onClick={onStay}style={{flex:1,padding:"12px",borderRadius:"12px",background:"var(--s)",border:"1px solid var(--bd)",color:"var(--t2)",fontSize:"13px",fontWeight:600,cursor:"pointer"}}>Stay at {pepDose}mg</button>
<button onClick={onDismiss}style={{flex:1,padding:"12px",borderRadius:"12px",background:"rgba(255,170,0,0.15)",border:"1px solid rgba(255,170,0,0.3)",color:"#ffaa00",fontSize:"13px",fontWeight:600,cursor:"pointer"}}>I'll consider {nextDose}mg</button>
</div></div>};

// MAIN APP
export default function Apex(){
const[data,setData]=useState(()=>({...defs(),...ld(SK,defs())}));const[view,setView]=useState("dashboard");const[msgs,setMsgs]=useState(()=>ld(CK,[]));const[wp,setWp]=useState(()=>ld(WPK,null));const[inp,setInp]=useState("");const[busy,setBusy]=useState(false);const[toast,setToast]=useState(null);const[mIn,setMIn]=useState({p:"",c:"",f:"",cal:""});const[wIn,setWIn]=useState("");const[err,setErr]=useState(null);const[selDay,setSelDay]=useState(null);const[genW,setGenW]=useState(false);const[showBump,setShowBump]=useState(false);const endRef=useRef(null);const pendRef=useRef(null);const fileRef=useRef(null);
const pr=data.profile;const hasKey=!!import.meta.env.VITE_ANTHROPIC_KEY&&import.meta.env.VITE_ANTHROPIC_KEY!=="PLACEHOLDER";const tg=calcT(pr);const tl=data.macroLog[todayStr()]||{protein:0,carbs:0,fats:0,cals:0};const isInj=pr&&new Date().getDay()===pr.injectionDay;
const pepWeek=pr&&pr.retaStartDate?Math.max(1,Math.ceil((Date.now()-new Date(pr.retaStartDate).getTime())/604800000)):0;
const pepDose=pr&&pr.peptide&&pr.peptide!=="none"?(pepWeek<=4?1:pepWeek<=8?2:pepWeek<=12?4:pepWeek<=16?8:12):0;
const pepBump=(()=>{if(!pepDose)return null;for(const t of[4,8,12,16]){if(pepWeek<=t)return(t-pepWeek+1)*7}return null})();
const nextDose=pepDose===1?2:pepDose===2?4:pepDose===4?8:pepDose===8?12:12;
const bumpSoon=pepBump!==null&&pepBump<=7&&!data.bumpDismissed?.[`wk${pepWeek}`];

const upd=useCallback(fn=>setData(prev=>{const n=typeof fn==="function"?fn(prev):{...prev,...fn};sv(SK,n);return n}),[]);
const note=(m)=>{setToast(m);setTimeout(()=>setToast(null),4000)};
useEffect(()=>{if(msgs.length>0)sv(CK,msgs.slice(-50))},[msgs]);
useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"})},[msgs,busy]);
useEffect(()=>{if(bumpSoon&&view==="dashboard")setShowBump(true)},[view,bumpSoon]);

// Notifications + 10pm report
useEffect(()=>{if(!data.notificationsEnabled||!pr)return;let last="";const iv=setInterval(()=>{const now=new Date(),hm=`${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;if(hm===last)return;if(hm==="22:00"&&Notification.permission==="granted"){last=hm;const t=data.macroLog[todayStr()]||{protein:0,carbs:0,fats:0,cals:0};const trg=calcT(pr);const pp=Math.round((t.protein/trg.pro)*100);new Notification("APEX Daily Report",{body:`Protein: ${t.protein}/${trg.pro}g (${pp}%) | Cals: ${t.cals}/${trg.cals}\n${pp>=80?"Great day!":"Push harder tomorrow"}`});return}const match=NOTIFS.find(n=>n.time===hm);if(match&&Notification.permission==="granted"){last=hm;new Notification("APEX",{body:match.msg})}},30000);return()=>clearInterval(iv)},[data.notificationsEnabled,pr]);

// Welcome — NO workout option in chat
useEffect(()=>{if(view==="chat"&&msgs.length===0&&pr){const pepInfo=pr.peptide&&pr.peptide!=="none"?`${pr.peptide} ${pr.peptideDose}mg · Week ${pepWeek}${pepBump?` (bump in ${pepBump}d)`:" (max)"}`:"No peptide";setMsgs([{role:"assistant",content:`Yo ${pr.name} 👋 **APEX** locked in.\n\n**${pr.goal.replace("_"," ")}** | ${pepInfo}\nTargets: **${tg.pro}p / ${tg.carbs}c / ${tg.fats}f / ${tg.cals}cal**\n\n- 🥗 Meal plan\n- 📸 Scan groceries (photo)\n- 🍳 "I have chicken, rice..." → recipe\n- 📊 Check-in\n- 🔄 Swap [food]\n- 🍔 Eating at [restaurant]\n- 📝 "I had [food]" → auto log\n\n*Workouts are in the Train tab* 🏋️`}])}},[view,pr]);
useEffect(()=>{if(view==="chat"&&pendRef.current&&msgs.length>0){const m=pendRef.current;pendRef.current=null;setTimeout(()=>send(m),150)}},[view,msgs.length]);

// Send message
const send=async(override,img64)=>{const txt=(override||inp).trim();if((!txt&&!img64)||busy||!pr)return;setInp("");setErr(null);if(!hasKey){note("⚠️ Set API key in .env");return}
const tm=data.macroLog[todayStr()]||{protein:0,carbs:0,fats:0,cals:0};const ctx=`[${pr.weight}lb|${pr.goal}|${tm.protein}p/${tm.carbs}c/${tm.fats}f/${tm.cals}cal of ${tg.pro}p/${tg.carbs}c/${tg.fats}f/${tg.cals}cal]`;
const uC=img64?[{type:"image",source:{type:"base64",media_type:"image/jpeg",data:img64}},{type:"text",text:txt||"Read this grocery/fridge photo. Identify food items, suggest a recipe using some. Include [MACROS: protein=Xg carbs=Xg fats=Xg cals=X]. Ask cook this or something else?"}]:txt;
const nM=[...msgs,{role:"user",content:img64?(txt||"📸 Photo"):txt}];setMsgs(nM);setBusy(true);
try{const lm=nM.slice(-10).map((m,i)=>i===nM.slice(-10).length-1&&img64?{role:"user",content:uC}:m);const am=[{role:"user",content:ctx},{role:"assistant",content:"Got it."},...lm];
const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":import.meta.env.VITE_ANTHROPIC_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:MODEL,max_tokens:4096,system:buildSystemPrompt(pr),messages:am})});
if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e?.error?.message||`HTTP ${res.status}`)}
const rd=await res.json();const reply=rd.content?.map(b=>b.text||"").join("\n")||"No response.";setMsgs(p=>[...p,{role:"assistant",content:reply}]);
const cleanReply=reply.replace(/\*\*/g,"");
const mm=cleanReply.match(/\[MACROS:\s*protein=(\d+)g?\s*carbs=(\d+)g?\s*fats=(\d+)g?\s*cals=(\d+)\]/i);
if(mm){const[,pp,cc,ff,cal]=mm.map(Number);const k=todayStr();upd(p=>({...p,macroLog:{...p.macroLog,[k]:{protein:(p.macroLog[k]?.protein||0)+pp,carbs:(p.macroLog[k]?.carbs||0)+cc,fats:(p.macroLog[k]?.fats||0)+ff,cals:(p.macroLog[k]?.cals||0)+cal}}}));note(`✅ ${pp}p ${cc}c ${ff}f ${cal}cal`)}
const wm=txt.match(/(\d{2,3}(?:\.\d{1,2})?)\s*(lbs?|pounds?)/i);if(wm){const w=parseFloat(wm[1]);if(w>=80&&w<=500){upd(p=>({...p,profile:{...p.profile,weight:w},weightHistory:[...(p.weightHistory||[]),{date:todayStr(),weight:w}]}));note(`⚖️ ${w}lbs`)}}
}catch(e){setMsgs(p=>[...p,{role:"assistant",content:`**Error** ⚠️\n${e.message}\nCheck .env key & restart.`}]);setErr(e.message)}finally{setBusy(false)}};

const goChat=(m)=>{if(view==="chat"&&msgs.length>0)send(m);else{pendRef.current=m;setView("chat")}};

// Generate workout — with rest day config
const genWorkout=async()=>{if(!hasKey||!pr||genW)return;setGenW(true);try{
const restDays=pr.restDays||2;const trainDays=7-restDays;
const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":import.meta.env.VITE_ANTHROPIC_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:MODEL,max_tokens:4096,system:buildSystemPrompt(pr),messages:[{role:"user",content:`Generate my 2-week workout plan with ${trainDays} training days and ${restDays} rest days per week.

STRICT REQUIREMENTS:
- Respond with ONLY valid JSON. No markdown, no backticks, no text before or after.
- Each week must have exactly 7 days in order: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday
- Use EXACTLY these field names for exercises: name, sets, reps, rest, desc, target, mistake, tip
- Day type must be one of: "Push", "Pull", "Legs", "Upper", "Lower", "Full Body", "Rest"
- Week 1 and Week 2 must use DIFFERENT exercises for same muscle groups
- Rest days: {"day":"Thursday","type":"Rest","subtitle":"Recovery or light cardio","isRest":true,"exercises":[]}

JSON format:
{"weeks":[{"weekNum":1,"days":[{"day":"Monday","type":"Push","subtitle":"Chest, Shoulders & Triceps","isRest":false,"exercises":[{"name":"Barbell Bench Press","sets":4,"reps":"8-10","rest":"90s","desc":"Lie flat, grip just outside shoulder width, lower bar to chest, press up.","target":"Chest, front delts, triceps","mistake":"Flaring elbows too wide","tip":"Keep shoulder blades retracted throughout"}]}]}]}`}]})});
if(!res.ok){const eb=await res.json().catch(()=>({}));throw new Error(`HTTP ${res.status}: ${eb?.error?.message||JSON.stringify(eb)}`)}
const rd=await res.json();let raw=rd.content?.map(b=>b.text||"").join("")||"";raw=raw.replace(/```json\s*/g,"").replace(/```\s*/g,"").trim();const plan=JSON.parse(raw);setWp(plan);sv(WPK,plan);note("💪 Plan generated!")
}catch(e){note("⚠️ "+e.message);setErr(e.message)}finally{setGenW(false)}};

const handlePhoto=(e)=>{const file=e.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{const b64=reader.result.split(",")[1];setView("chat");setTimeout(()=>send("",b64),200)};reader.readAsDataURL(file);e.target.value=""};
const logM=()=>{const p=parseInt(mIn.p)||0,c=parseInt(mIn.c)||0,f=parseInt(mIn.f)||0,cal=parseInt(mIn.cal)||Math.round(p*4+c*4+f*9);if(!p&&!c&&!f&&!cal){note("Enter a value");return}const k=todayStr();upd(pr=>({...pr,macroLog:{...pr.macroLog,[k]:{protein:(pr.macroLog[k]?.protein||0)+p,carbs:(pr.macroLog[k]?.carbs||0)+c,fats:(pr.macroLog[k]?.fats||0)+f,cals:(pr.macroLog[k]?.cals||0)+cal}}}));setMIn({p:"",c:"",f:"",cal:""});note(`✅ ${p}p/${c}c/${f}f/${cal}cal`)};
const logW=()=>{const w=parseFloat(wIn);if(!w||w<80||w>500){note("Valid weight pls");return}upd(p=>({...p,profile:{...p.profile,weight:w},weightHistory:[...(p.weightHistory||[]),{date:todayStr(),weight:w}]}));setWIn("");note(`⚖️ ${w}lbs`)};
const clearChat=()=>{setMsgs([]);localStorage.removeItem(CK);note("Cleared")};
const reqNotif=async()=>{if(!("Notification"in window)){note("Not supported");return}const p=await Notification.requestPermission();if(p==="granted"){upd({notificationsEnabled:true});note("🔔 On!")}};

const tabs=[{id:"dashboard",ic:"⚡",lb:"Home"},{id:"chat",ic:"💬",lb:"Coach"},{id:"workouts",ic:"🏋️",lb:"Train"},{id:"macros",ic:"🥗",lb:"Macros"},{id:"progress",ic:"📈",lb:"Progress"}];
const C={background:"var(--s)",border:"1px solid var(--bd)",borderRadius:"16px",padding:"18px",marginBottom:"12px",backdropFilter:"blur(10px)"};
const Lb={fontSize:"10px",color:"var(--t4)",letterSpacing:"0.12em",textTransform:"uppercase",fontFamily:"var(--m)",marginBottom:"14px"};
const iS={background:"var(--s2)",border:"1px solid var(--bd)",borderRadius:"12px",padding:"12px 14px",color:"var(--t1)",fontSize:"14px",fontFamily:"var(--f)",width:"100%",outline:"none"};
const bS=(a=true)=>({background:a?"var(--a)":"var(--s2)",color:a?"var(--bg)":"var(--t4)",border:"none",borderRadius:"12px",padding:"13px 18px",fontSize:"14px",fontWeight:700,cursor:a?"pointer":"not-allowed",transition:"all .2s",boxShadow:a?"0 0 16px rgba(0,255,170,0.15)":"none"});
const ppct=Math.min(100,Math.round((tl.protein/tg.pro)*100));

if(!pr)return<><style>{CSS()}</style><Onboarding onComplete={p=>upd({profile:p})}/></>;

return<div style={{minHeight:"100vh",background:"var(--bg)",color:"var(--t1)",fontFamily:"var(--f)",display:"flex",flexDirection:"column",maxWidth:"480px",margin:"0 auto"}}><style>{CSS()}</style>
<input ref={fileRef}type="file"accept="image/*"capture="environment"style={{display:"none"}}onChange={handlePhoto}/>
{toast&&<div style={{position:"fixed",top:"14px",left:"50%",transform:"translateX(-50%)",zIndex:999,background:"var(--s)",border:"1px solid var(--bd)",borderRadius:"14px",padding:"12px 18px",maxWidth:"340px",fontSize:"13px",animation:"sD .3s",boxShadow:"0 8px 40px rgba(0,0,0,.6)",textAlign:"center",backdropFilter:"blur(12px)"}}>{toast}</div>}

{/* Header */}
<div style={{background:"rgba(8,10,12,0.9)",backdropFilter:"blur(16px)",borderBottom:"1px solid var(--bd)",padding:"12px 16px",display:"flex",alignItems:"center",gap:"10px",position:"sticky",top:0,zIndex:50}}>
<div style={{width:"36px",height:"36px",background:"var(--a)",borderRadius:"10px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"18px",flexShrink:0,boxShadow:"0 0 14px rgba(0,255,170,0.3)"}}>⚡</div>
<div style={{flex:1}}><div style={{fontFamily:"var(--m)",fontWeight:700,fontSize:"14px",letterSpacing:"0.1em"}}>APEX</div><div style={{fontSize:"9px",color:isInj?"#c084fc":"var(--t4)",letterSpacing:"0.1em",textTransform:"uppercase"}}>{isInj?"💉 INJECTION DAY":`${pr.name}'s Coach`}</div></div>
<div style={{textAlign:"right"}}><div style={{fontSize:"11px",color:"var(--a)",fontFamily:"var(--m)"}}>{pr.weight} lbs</div><div style={{display:"flex",alignItems:"center",gap:"4px",justifyContent:"flex-end"}}><div style={{width:"5px",height:"5px",borderRadius:"50%",background:hasKey?"var(--a)":"#ff4466",boxShadow:hasKey?"0 0 6px var(--a)":"0 0 6px #ff4466"}}/><span style={{fontSize:"8px",color:hasKey?"var(--a)":"#ff4466",fontFamily:"var(--m)"}}>{hasKey?"LIVE":"NO KEY"}</span></div></div></div>

<div style={{flex:1,overflowY:"auto",padding:view==="chat"?"0":"14px 14px 85px"}}>

{/* DASHBOARD */}
{view==="dashboard"&&<div style={{animation:"fadeIn .25s"}}>
{isInj&&<div style={{background:"linear-gradient(135deg,rgba(140,70,255,0.1),rgba(180,100,255,0.05))",border:"1px solid rgba(140,70,255,0.2)",borderRadius:"14px",padding:"14px 16px",marginBottom:"12px",display:"flex",alignItems:"center",gap:"12px"}}><span style={{fontSize:"26px"}}>💉</span><div><div style={{fontSize:"14px",fontWeight:600,color:"#c084fc"}}>Injection Day</div><div style={{fontSize:"12px",color:"var(--t3)"}}>Light meals. Low fat. Stay hydrated.</div></div></div>}

{/* Bump disclaimer */}
{showBump&&pr.peptide&&pr.peptide!=="none"&&<BumpDisclaimer pepWeek={pepWeek} pepDose={pepDose} nextDose={nextDose} profile={pr} onDismiss={()=>{setShowBump(false);upd(p=>({...p,bumpDismissed:{...p.bumpDismissed,[`wk${pepWeek}`]:true}}))}} onStay={()=>{setShowBump(false);upd(p=>({...p,bumpDismissed:{...p.bumpDismissed,[`wk${pepWeek}`]:true}}));note("Staying at "+pepDose+"mg ✓")}}/>}

{/* Peptide card */}
{pr.peptide&&pr.peptide!=="none"&&<div style={{...C,background:"linear-gradient(135deg,rgba(0,255,170,0.06),rgba(0,200,140,0.02))",border:"1px solid rgba(0,255,170,0.12)"}}>
<div style={{display:"flex",justifyContent:"space-between"}}><div><div style={Lb}>{pr.peptide}</div><div style={{fontSize:"28px",fontWeight:800,color:"var(--a)",fontFamily:"var(--f)"}}>{pr.peptideDose||0}mg<span style={{fontSize:"13px",color:"var(--t3)",fontWeight:400}}>/wk</span></div><div style={{fontSize:"11px",color:"var(--t4)",marginTop:"2px"}}>Week {pepWeek} · Suggested: {pepDose}mg</div></div>
<div style={{textAlign:"right"}}>{pepBump?<><div style={{fontSize:"9px",color:"var(--t4)",letterSpacing:"0.1em"}}>NEXT BUMP</div><div style={{fontSize:"22px",fontWeight:700,color:pepBump<=7?"#ffaa00":"var(--t2)",fontFamily:"var(--m)"}}>{pepBump}<span style={{fontSize:"11px",color:"var(--t4)"}}>d</span></div></>:<div style={{fontSize:"11px",color:"var(--a)",fontFamily:"var(--m)"}}>MAX ✓</div>}</div></div></div>}

<div style={C}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px"}}><div style={Lb}>Today's Macros</div><div style={{fontSize:"11px",fontWeight:600,color:ppct>=80?"var(--a)":"#ff4466"}}>{ppct}% protein</div></div>
<Bar label="PROTEIN"cur={tl.protein}max={tg.pro}color="var(--a)"/><Bar label="CARBS"cur={tl.carbs}max={tg.carbs}color="#60a5fa"/><Bar label="FATS"cur={tl.fats}max={tg.fats}color="#f97316"/><Bar label="CALORIES"cur={tl.cals}max={tg.cals}color="#a78bfa"unit=""/></div>

{/* Quick actions — NO workout option */}
<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"12px"}}>
{[{ic:"🥗",lb:"Meal Plan",m:"Give me a meal plan for this week"},{ic:"📸",lb:"Scan Food",action:()=>fileRef.current?.click()},{ic:"🍳",lb:"What Can I Cook?",m:"What can I cook?"},{ic:"📊",lb:"Check-In",m:"Weekly check-in"}].map(({ic,lb,m,action})=>
<button key={lb}onClick={action||(()=>goChat(m))}className="gc"style={{background:"var(--s)",border:"1px solid var(--bd)",borderRadius:"14px",padding:"18px 12px",cursor:"pointer",textAlign:"center",transition:"all .2s"}}><div style={{fontSize:"24px",marginBottom:"6px"}}>{ic}</div><div style={{fontSize:"12px",color:"var(--t2)",fontWeight:600}}>{lb}</div></button>)}</div>

<div style={C}><div style={Lb}>Accountability</div>
{data.notificationsEnabled?<div><div style={{fontSize:"13px",color:"var(--a)",marginBottom:"10px"}}>🔔 Active · 10pm daily report</div><button onClick={()=>{const m=LAZY[Math.floor(Math.random()*LAZY.length)];if(Notification.permission==="granted")new Notification("APEX",{body:m});note(m)}}style={{...bS(),width:"100%"}}>Motivation 🔥</button></div>
:<div><div style={{fontSize:"13px",color:"var(--t4)",marginBottom:"10px"}}>Reminders + 10pm daily report.</div><button onClick={reqNotif}style={{...bS(),width:"100%"}}>🔔 Enable</button></div>}</div>
<button onClick={()=>setView("settings")}style={{width:"100%",padding:"14px",borderRadius:"14px",background:"var(--s)",border:"1px solid var(--bd)",color:"var(--t3)",fontSize:"13px",cursor:"pointer"}}>⚙️ Settings</button>
</div>}

{/* CHAT — no workout option */}
{view==="chat"&&<div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 110px)"}}>
<div style={{padding:"6px 14px",borderBottom:"1px solid var(--bd)",display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(8,10,12,0.5)"}}><span style={{fontSize:"10px",color:"var(--t4)",fontFamily:"var(--m)"}}>{msgs.filter(m=>m.role==="user").length} msgs</span>{msgs.length>1&&<button onClick={clearChat}style={{background:"none",border:"none",color:"var(--t4)",fontSize:"10px",cursor:"pointer",fontFamily:"var(--m)"}}>Clear</button>}</div>
<div style={{flex:1,overflowY:"auto",padding:"12px 14px 8px",display:"flex",flexDirection:"column",gap:"10px"}}>
{msgs.map((m,i)=><div key={i}style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",animation:"sU .2s"}}>
{m.role==="assistant"&&<div style={{width:"26px",height:"26px",background:"var(--a)",borderRadius:"8px",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginRight:"8px",marginTop:"2px",fontSize:"13px",boxShadow:"0 0 8px rgba(0,255,170,0.2)"}}>⚡</div>}
<div style={{maxWidth:"85%",background:m.role==="user"?"var(--a)":"var(--s)",color:m.role==="user"?"var(--bg)":"var(--t1)",borderRadius:m.role==="user"?"16px 16px 4px 16px":"4px 16px 16px 16px",padding:"11px 14px",fontSize:"13px",lineHeight:1.7,border:m.role==="assistant"?"1px solid var(--bd)":"none",fontWeight:m.role==="user"?600:400,overflowWrap:"break-word"}}>{m.role==="user"?m.content:fmt(m.content)}</div></div>)}
{busy&&<div style={{display:"flex",gap:"8px",alignItems:"center"}}><div style={{width:"26px",height:"26px",background:"var(--a)",borderRadius:"8px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"13px"}}>⚡</div><div style={{background:"var(--s)",border:"1px solid var(--bd)",borderRadius:"4px 16px 16px 16px",padding:"13px 16px",display:"flex",gap:"5px"}}>{[0,1,2].map(j=><div key={j}className="da"style={{width:"6px",height:"6px",borderRadius:"50%",background:"var(--a)"}}/>)}</div></div>}
{err&&!busy&&<div style={{background:"rgba(255,68,102,0.06)",border:"1px solid rgba(255,68,102,0.15)",borderRadius:"10px",padding:"8px 12px",fontSize:"10px",color:"#ff4466",fontFamily:"var(--m)"}}>{err}</div>}
<div ref={endRef}/></div>
<div style={{padding:"4px 14px 6px",display:"flex",gap:"6px",overflowX:"auto"}}>{["Meal plan","What can I cook?","Swap chicken","Check-in"].map(a=><button key={a}className="ch"onClick={()=>send(a)}style={{flexShrink:0,background:"transparent",border:"1px solid var(--bd)",color:"var(--t4)",padding:"6px 12px",borderRadius:"20px",fontSize:"11px",cursor:"pointer"}}>{a}</button>)}</div>
<div style={{padding:"6px 12px 12px",display:"flex",gap:"8px",alignItems:"flex-end",borderTop:"1px solid var(--bd)"}}>
<button onClick={()=>fileRef.current?.click()}style={{width:"40px",height:"40px",borderRadius:"10px",background:"var(--s)",border:"1px solid var(--bd)",color:"var(--t3)",fontSize:"18px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>📷</button>
<textarea value={inp}onChange={e=>setInp(e.target.value)}onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}}}placeholder="Ask APEX..."rows={1}style={{...iS,flex:1,maxHeight:"100px",overflowY:"auto",resize:"none"}}onInput={e=>{e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,100)+"px"}}/>
<button onClick={()=>send()}disabled={busy||!inp.trim()}style={{...bS(!busy&&!!inp.trim()),width:"40px",height:"40px",padding:0,borderRadius:"10px",fontSize:"17px",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>↑</button></div></div>}

{/* WORKOUTS — Train tab */}
{view==="workouts"&&<div style={{animation:"fadeIn .25s"}}>
{selDay?<WDetail day={selDay}onBack={()=>setSelDay(null)}onDone={()=>{upd(p=>({...p,workoutLog:{...p.workoutLog,[todayStr()]:true}}));setSelDay(null);note("💪 Done!")}}/>:<>
{!wp?<div style={{...C,textAlign:"center",padding:"40px 20px"}}><div style={{fontSize:"40px",marginBottom:"16px"}}>🏋️</div><div style={{fontSize:"18px",fontWeight:700,marginBottom:"6px"}}>Generate Your Plan</div><div style={{fontSize:"13px",color:"var(--t3)",marginBottom:"6px",lineHeight:1.6}}>2-week program · {pr.trainingDays||5} training + {pr.restDays||2} rest days/week</div><div style={{fontSize:"12px",color:"var(--t4)",marginBottom:"20px"}}>Focus: {(pr.focusAreas||[]).join(", ")||"Overall"}</div><button onClick={genWorkout}disabled={genW}style={{...bS(!genW),width:"100%"}}>{genW?"⏳ Generating...":"⚡ Generate 2-Week Plan"}</button></div>:<>
{wp.weeks?.map((wk,wi)=>{
const orderedDays=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const dayMap={};(wk.days||[]).forEach(d=>{if(d.day)dayMap[d.day]=d});
return<div key={wi}style={{marginBottom:"20px"}}>
<div style={{...Lb,marginBottom:"12px"}}>Week {wk.weekNum}</div>
<div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:"5px",marginBottom:"6px"}}>{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d,i)=><div key={i}style={{textAlign:"center",fontSize:"9px",color:"var(--t4)",fontFamily:"var(--m)"}}>{d}</div>)}</div>
<div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:"5px"}}>{orderedDays.map((dayName,di)=>{
const day=dayMap[dayName]||(wk.days||[])[di];
if(!day)return<div key={di}style={{aspectRatio:"1"}}/>;
const done=data.workoutLog[`w${wi+1}d${dayName}`];
const typeShort=day.isRest?"REST":(day.type||"").replace(/day/i,"").replace(/[-–]/g,"").trim().split(" ")[0].slice(0,4).toUpperCase()||"DAY";
const typeColor=typeShort==="PUSH"?"#f97316":typeShort==="PULL"?"#60a5fa":typeShort==="LEGS"?"#a78bfa":typeShort==="REST"?"#60a5fa":typeShort.startsWith("UPP")?"#f0ff4b":typeShort.startsWith("LOW")?"#c084fc":"var(--a)";
return<button key={di}onClick={()=>setSelDay(day)}style={{aspectRatio:"1",borderRadius:"10px",background:day.isRest?"rgba(96,165,250,0.05)":done?"rgba(0,255,170,0.12)":"var(--s)",border:`1px solid ${day.isRest?"rgba(96,165,250,0.12)":done?"rgba(0,255,170,0.3)":"var(--bd)"}`,cursor:day.isRest?"default":"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",transition:"all .2s",padding:"3px",gap:"2px"}}>
<div style={{fontSize:"8px",fontWeight:700,color:done&&!day.isRest?"var(--a)":typeColor,fontFamily:"var(--m)",letterSpacing:"0.04em"}}>{typeShort}</div>
{done&&!day.isRest&&<div style={{fontSize:"8px",color:"var(--a)"}}>✓</div>}
{day.isRest&&<div style={{fontSize:"10px"}}>😴</div>}
</button>})}
</div></div>})}
<button onClick={()=>{setWp(null);localStorage.removeItem(WPK)}}style={{width:"100%",padding:"14px",borderRadius:"14px",background:"var(--s)",border:"1px solid var(--bd)",color:"var(--t3)",fontSize:"13px",cursor:"pointer",marginTop:"4px"}}>🔄 Regenerate Plan</button></>}</>}</div>}

{/* MACROS */}
{view==="macros"&&<div style={{animation:"fadeIn .25s"}}>
<div style={C}><div style={Lb}>Today's Progress</div><Bar label="PROTEIN"cur={tl.protein}max={tg.pro}color="var(--a)"/><Bar label="CARBS"cur={tl.carbs}max={tg.carbs}color="#60a5fa"/><Bar label="FATS"cur={tl.fats}max={tg.fats}color="#f97316"/><Bar label="CALORIES"cur={tl.cals}max={tg.cals}color="#a78bfa"unit=""/>
<div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"8px",marginTop:"14px"}}>{[["PRO",tl.protein,tg.pro,"var(--a)"],["CARB",tl.carbs,tg.carbs,"#60a5fa"],["FAT",tl.fats,tg.fats,"#f97316"],["CAL",tl.cals,tg.cals,"#a78bfa"]].map(([l,c,t,col])=><div key={l}style={{background:"var(--s2)",borderRadius:"12px",padding:"12px 6px",textAlign:"center"}}><div style={{fontSize:"9px",color:"var(--t4)",fontFamily:"var(--m)"}}>{l}</div><div style={{fontSize:"18px",fontWeight:700,color:c>t?"#ff4466":col,fontFamily:"var(--m)"}}>{Math.max(0,t-c)}</div><div style={{fontSize:"8px",color:"var(--t4)"}}>left</div></div>)}</div></div>
<div style={C}><div style={Lb}>Log a Meal</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px",marginBottom:"8px"}}>{[["Protein","p"],["Carbs","c"],["Fats","f"],["Calories","cal"]].map(([pl,k])=><input key={k}type="number"placeholder={pl}value={mIn[k]}onChange={e=>setMIn(p=>({...p,[k]:e.target.value}))}style={iS}/>)}</div><button onClick={logM}style={{...bS(),width:"100%"}}>Log Macros</button></div>
<div style={C}><div style={Lb}>What can I cook?</div><div style={{fontSize:"13px",color:"var(--t3)",marginBottom:"12px"}}>Snap a grocery photo or type what's in your fridge.</div><div style={{display:"flex",gap:"8px"}}><button onClick={()=>fileRef.current?.click()}style={{...bS(),flex:1,background:"transparent",border:"1px solid var(--a)",color:"var(--a)",boxShadow:"none"}}>📸 Scan</button><button onClick={()=>goChat("I have in my fridge: ")}style={{...bS(),flex:1}}>✏️ Type</button></div></div></div>}

{/* PROGRESS */}
{view==="progress"&&(()=>{
const proLeft=Math.max(0,tg.pro-tl.protein),carbLeft=Math.max(0,tg.carbs-tl.carbs),fatLeft=Math.max(0,tg.fats-tl.fats),calLeft=Math.max(0,tg.cals-tl.cals);
const workedOut=!!data.workoutLog[todayStr()];
const dc=data.dailyChecks[todayStr()]||{};
const toggleCheck=(k)=>upd(p=>{const td=p.dailyChecks[todayStr()]||{};return{...p,dailyChecks:{...p.dailyChecks,[todayStr()]:{...td,[k]:!td[k]}}};});
const proHit=tl.protein>=tg.pro,calHit=tl.cals>=tg.cals*0.85;
const quoteIdx=new Date().getDate()%QUOTES.length;

// Smart suggestions based on remaining macros
const suggestions=[];
if(proLeft>0&&proLeft<=30){suggestions.push({food:"Whey protein shake",pro:25,cal:120},{food:"Greek yogurt cup",pro:15,cal:100},{food:"String cheese (2)",pro:14,cal:160})}
else if(proLeft>30&&proLeft<=60){suggestions.push({food:"Chicken breast (6oz)",pro:42,cal:190},{food:"Whey shake + banana",pro:27,cal:220},{food:"Tuna packet",pro:20,cal:90})}
else if(proLeft>60){suggestions.push({food:"Chicken breast (8oz) + rice",pro:52,cal:380},{food:"Ground turkey bowl",pro:35,cal:300},{food:"Whey shake + PB toast",pro:32,cal:350})}

return<div style={{animation:"fadeIn .25s"}}>
{/* Daily checklist */}
<div style={C}><div style={Lb}>Today's Checklist</div>
{[
{key:"workout",label:"Workout completed",auto:workedOut,icon:"🏋️"},
{key:"protein",label:`Protein goal${proHit?"":" ("+proLeft+"g left)"}`,auto:proHit,icon:"🥩"},
{key:"calories",label:`Calorie goal${calHit?"":" ("+calLeft+" left)"}`,auto:calHit,icon:"🔥"},
{key:"creatine",label:"Creatine taken",auto:false,manual:true,icon:"💊"},
{key:"water",label:"Water intake (64oz+)",auto:false,manual:true,icon:"💧"},
{key:"supplements",label:"Supplements taken",auto:false,manual:true,icon:"🧴"},
].map(({key,label,auto,manual,icon})=>{
const checked=auto||(dc[key]||false);
return<button key={key}onClick={()=>manual&&toggleCheck(key)}style={{width:"100%",display:"flex",alignItems:"center",gap:"12px",padding:"12px 0",background:"none",border:"none",borderBottom:"1px solid rgba(255,255,255,0.03)",cursor:manual?"pointer":"default",textAlign:"left"}}>
<div style={{width:"24px",height:"24px",borderRadius:"8px",background:checked?"var(--a)":"var(--s2)",border:`1px solid ${checked?"var(--a)":"var(--bd)"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"12px",transition:"all .2s",flexShrink:0,boxShadow:checked?"0 0 8px rgba(0,255,170,0.2)":"none"}}>{checked?"✓":""}</div>
<span style={{fontSize:"13px",color:checked?"var(--a)":"var(--t2)",fontWeight:checked?600:400,flex:1}}>{icon} {label}</span>
{manual&&!auto&&<span style={{fontSize:"9px",color:"var(--t4)",fontFamily:"var(--m)"}}>TAP</span>}
</button>})}
<div style={{marginTop:"12px",textAlign:"center"}}><span style={{fontSize:"12px",color:"var(--t3)"}}>{[workedOut,proHit,calHit,dc.creatine,dc.water,dc.supplements].filter(Boolean).length}/6 complete</span></div>
</div>

{/* Smart suggestion */}
{proLeft>0&&<div style={{...C,background:"linear-gradient(135deg,rgba(0,255,170,0.04),rgba(0,200,140,0.02))",border:"1px solid rgba(0,255,170,0.1)"}}>
<div style={Lb}>🎯 Close the Gap</div>
<div style={{fontSize:"13px",color:"var(--t2)",marginBottom:"12px"}}>{proLeft}g protein left · Here's how:</div>
{suggestions.map((s,i)=><div key={i}style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",background:"var(--s)",borderRadius:"10px",marginBottom:"6px"}}>
<div><div style={{fontSize:"13px",color:"var(--t1)",fontWeight:500}}>{s.food}</div><div style={{fontSize:"11px",color:"var(--t4)",marginTop:"2px"}}>{s.cal} cal</div></div>
<div style={{fontSize:"14px",fontWeight:700,color:"var(--a)",fontFamily:"var(--m)"}}>{s.pro}g</div>
</div>)}
<div style={{fontSize:"11px",color:"var(--t4)",marginTop:"8px",textAlign:"center"}}>Tap any meal idea → ask APEX for the full recipe in Coach tab</div>
</div>}

{/* Weight trend */}
<div style={C}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px"}}><div style={Lb}>Weight Trend</div><div style={{fontSize:"22px",fontWeight:800,color:"var(--a)"}}>{pr.weight}<span style={{fontSize:"12px",color:"var(--t4)",fontWeight:400}}> lbs</span></div></div><WChart history={data.weightHistory||[]}/>
<div style={{marginTop:"14px",display:"flex",gap:"8px"}}><input type="number"placeholder="Weight"value={wIn}onChange={e=>setWIn(e.target.value)}onKeyDown={e=>{if(e.key==="Enter")logW()}}style={{...iS,flex:1}}/><button onClick={logW}style={{...bS(),flexShrink:0}}>Log</button></div></div>

{/* Weight history */}
{(data.weightHistory?.length||0)>0&&<div style={C}><div style={Lb}>History</div>{[...(data.weightHistory||[])].reverse().slice(0,10).map((e,i)=><div key={i}style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid var(--bd)",fontSize:"12px"}}><span style={{color:"var(--t3)"}}>{e.date}</span><span style={{color:"var(--a)",fontFamily:"var(--m)"}}>{e.weight} lbs</span></div>)}</div>}

{/* Motivation */}
<div style={{background:"linear-gradient(135deg,rgba(0,255,170,0.03),rgba(96,165,250,0.03))",border:"1px solid rgba(255,255,255,0.04)",borderRadius:"16px",padding:"24px 20px",marginBottom:"12px",textAlign:"center"}}>
<div style={{fontSize:"14px",color:"var(--t2)",lineHeight:1.8,fontStyle:"italic"}}>"{QUOTES[quoteIdx]}"</div>
<div style={{fontSize:"10px",color:"var(--t4)",marginTop:"10px",fontFamily:"var(--m)"}}>DAILY MOTIVATION</div>
</div>
</div>})()}

{/* SETTINGS */}
{view==="settings"&&<div style={{animation:"fadeIn .25s"}}>
<button onClick={()=>setView("dashboard")}style={{background:"none",border:"none",color:"var(--a)",fontSize:"13px",cursor:"pointer",fontFamily:"var(--m)",marginBottom:"16px",padding:0}}>← Back</button>
<div style={C}><div style={Lb}>Profile</div><div style={{fontSize:"14px",color:"var(--t1)",marginBottom:"4px"}}><strong>{pr.name}</strong>{pr.email?` · ${pr.email}`:""}</div><div style={{fontSize:"12px",color:"var(--t3)",marginBottom:"4px"}}>{pr.goal.replace("_"," ")} · {pr.experience}{pr.height?` · ${Math.floor(pr.height/12)}'${pr.height%12}"`:""}</div><div style={{fontSize:"12px",color:"var(--t3)",marginBottom:"4px"}}>{pr.peptide&&pr.peptide!=="none"?`${pr.peptide} ${pr.peptideDose}mg · Week ${pepWeek}`:"No peptide"}</div><div style={{fontSize:"12px",color:"var(--t3)",marginBottom:"12px"}}>Focus: {(pr.focusAreas||[]).join(", ")} · {pr.trainingDays||5}d train / {pr.restDays||2}d rest · Inj: {dayN[pr.injectionDay]}</div><input type="number"placeholder="Update weight"defaultValue={pr.weight}id="sw"style={{...iS,marginBottom:"8px"}}/><button onClick={()=>{const w=parseFloat(document.getElementById("sw").value);upd(p=>({...p,profile:{...p.profile,weight:w||p.profile.weight}}));note("✅ Saved")}}style={{...bS(),width:"100%"}}>Save</button></div>
<div style={C}><div style={Lb}>API</div><div style={{display:"flex",alignItems:"center",gap:"6px"}}><div style={{width:"6px",height:"6px",borderRadius:"50%",background:hasKey?"var(--a)":"#ff4466"}}/><span style={{fontSize:"12px",color:"var(--t3)"}}>{hasKey?"Connected (Sonnet 4.6)":"Not connected"}</span></div></div>
<div style={C}><div style={Lb}>Data</div><button onClick={clearChat}style={{width:"100%",padding:"14px",borderRadius:"14px",background:"var(--s)",border:"1px solid var(--bd)",color:"var(--t3)",fontSize:"13px",cursor:"pointer",marginBottom:"8px"}}>Clear chat</button><button onClick={()=>{localStorage.clear();window.location.reload()}}style={{width:"100%",padding:"14px",borderRadius:"14px",background:"rgba(255,68,102,0.06)",border:"1px solid rgba(255,68,102,0.15)",color:"#ff4466",fontSize:"13px",cursor:"pointer"}}>Reset everything</button></div>
<div style={{textAlign:"center",padding:"24px",fontSize:"10px",color:"var(--t4)",fontFamily:"var(--m)"}}>APEX v3.1 · Sonnet 4.6</div></div>}
</div>

{/* NAV */}
{view!=="settings"&&<div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:"480px",background:"rgba(8,10,12,0.95)",backdropFilter:"blur(16px)",borderTop:"1px solid var(--bd)",display:"flex",zIndex:50}}>{tabs.map(t=><button key={t.id}className="tb"onClick={()=>setView(t.id)}style={{flex:1,background:"none",border:"none",padding:"10px 4px 14px",cursor:"pointer",color:view===t.id?"var(--a)":"var(--t4)",transition:"color .15s"}}><div style={{fontSize:"18px"}}>{t.ic}</div><div style={{fontSize:"7px",marginTop:"3px",letterSpacing:"0.08em",fontFamily:"var(--m)",textTransform:"uppercase"}}>{t.lb}</div></button>)}</div>}
</div>}

function CSS(){return`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
:root{--bg:#080a0c;--s:rgba(16,20,24,0.8);--s2:rgba(24,28,34,0.6);--bd:rgba(255,255,255,0.06);--a:#00ffaa;--t1:#eef2f6;--t2:#a0aab4;--t3:#6a7480;--t4:#3a4450;--f:'Outfit',sans-serif;--m:'JetBrains Mono',monospace}
*{box-sizing:border-box;margin:0;padding:0}body{background:var(--bg)}::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:var(--bd);border-radius:2px}input::placeholder,textarea::placeholder{color:var(--t4)}input:focus,textarea:focus,select:focus{border-color:var(--a)!important;outline:none}
.tb:hover{color:var(--a)!important}.ch:hover{background:var(--a)!important;color:var(--bg)!important;border-color:var(--a)!important}.gc:hover{border-color:rgba(0,255,170,0.25)!important;box-shadow:0 0 20px rgba(0,255,170,0.06);transform:translateY(-2px)}
.da{animation:blink 1.2s infinite}.da:nth-child(2){animation-delay:.2s}.da:nth-child(3){animation-delay:.4s}
@keyframes blink{0%,80%,100%{opacity:.15}40%{opacity:1}}@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes sIn{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:translateX(0)}}@keyframes sU{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}@keyframes sD{from{opacity:0;transform:translateY(-16px)}to{opacity:1;transform:translateY(0)}}
select{appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%236a7480' viewBox='0 0 16 16'%3E%3Cpath d='M8 12L2 6h12z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center}option{background:#0c0e12;color:var(--t1)}`}
