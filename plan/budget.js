// 가계부 탭: 자산현황 · 생활비 · 용돈 — budget.json 을 읽어 그리기만 함 (입력 없음)
(function(){
  const pad=n=>String(n).padStart(2,"0");
  const won=n=>Math.round(Number(n)||0).toLocaleString("ko-KR")+"원";
  const num=n=>Math.round(Number(n)||0).toLocaleString("ko-KR");
  const sgn=n=>(n<0?"−":"+")+won(Math.abs(n));
  const big=n=>{const v=Math.round(Number(n)||0),a=Math.abs(v),s=v<0?"−":"";
    if(a>=1e8){const eok=Math.floor(a/1e8),man=Math.round((a%1e8)/1e4);return s+eok+"억"+(man?" "+man.toLocaleString("ko-KR")+"만":"")}
    if(a>=1e4)return s+Math.round(a/1e4).toLocaleString("ko-KR")+"만";return s+a.toLocaleString("ko-KR")+"원"};
  const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const parse=s=>{const [y,m,d]=String(s).split("-").map(Number);return new Date(y,m-1,d||1)};
  const md=s=>{const d=parse(s);return (d.getMonth()+1)+"/"+d.getDate()};
  const todayStr=()=>{const d=new Date();return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())};
  const dayDiff=(a,b)=>Math.round((parse(b)-parse(a))/864e5);
  const ymLabel=ym=>{const [y,m]=ym.split("-");return `${y}년 ${Number(m)}월`};
  const monthsBetween=(a,b)=>{const [ay,am]=a.split("-").map(Number),[by,bm]=b.split("-").map(Number);return (by-ay)*12+(bm-am)};
  const nowYm=()=>todayStr().slice(0,7);
  const $=(el,q)=>el.querySelector(q);

  const curIdx=()=>DATA?Math.max(0,monthsBetween(DATA.assets.baseMonth,nowYm())):0;
  let DATA=null,root=null,FILLS=[],ADDS=[],fdb=null,fme=()=>"";
const FILL_CODES=["할부","대출","시뇽 비상자금","야근 보너스","기타"];
  const st={price:null,simYm:null,simPrice:null,housing:null,mi:0};

  // ───── 자산현황 ─────
  // ───── 대출 시뮬레이션 (눈덩이) ─────
  // 매달 대출에 쓰는 돈(기준월 납입 총액)은 그대로 유지. 분할상환 대출은 정해진 납입액대로 갚고(이자↓ 원금↑),
  // 대출 하나가 끝나면 거기 들어가던 돈이 '추가 상환'으로 넘어감. 추가 상환 우선순위: 시뇽 명의 이자만 대출(잔액 작은 순)
  // → 홍균 명의 이자만 대출(잔액 작은 순) → 기타 채무(이자 없음) → 주담대. 이자만 대출을 갚으면 그 이자도 풀려서 더 빨라짐.
  const mr=l=>(l.rate||0)/100/12;
  let SIM=null;
  function simulate(a){
    const loans=a.loans.map((l,i)=>({id:"L"+i,name:(l.bank.includes(l.type)?l.bank:l.bank+" "+l.type)+" "+big(l.balance||0),bank:l.bank,type:l.type,group:l.group,owner:l.owner||"홍균",rate:l.rate||0,r:mr(l),bal:l.balance||0,P:l.monthlyPayment||0,closed:null}));
    const otherBal=(a.otherDebts||[]).reduce((n,d)=>n+(d.amount||0),0);
    const other={id:"OTHER",name:(a.otherDebts||[]).map(d=>d.name).join(", ")||"기타 채무",group:"other",r:0,bal:otherBal,closed:otherBal>0?null:0};
    const budget=loans.reduce((n,l)=>n+(l.group==="io"?l.bal*l.r:l.P),0);
    const ioOrder=g=>loans.filter(l=>l.group==="io"&&l.owner===g).sort((x,y)=>x.bal-y.bal);
    const priority=[...ioOrder("시뇽"),...ioOrder("홍균"),other,...loans.filter(l=>l.group==="mortgage")];
    const months=[],events=[];const ym=t=>addYm(a.baseMonth,t);
    for(let t=0;t<=1200;t++){
      const snap={t,ym:ym(t),loans:{},other:{start:other.bal,extra:0},spent:0,extra:0,interest:0,principal:0,events:[]};
      for(const l of loans){
        const start=l.bal;let interest=0,sched=0,principal=0;
        if(l.bal>0){interest=l.bal*l.r;
          if(l.group!=="io"){sched=Math.min(l.P,l.bal+interest);principal=sched-interest;l.bal=Math.max(0,l.bal-principal)}
          else sched=interest;}
        snap.loans[l.id]={start,interest,sched,principal,extra:0,end:l.bal};snap.spent+=sched;snap.interest+=interest;snap.principal+=principal;
      }
      let free=Math.max(0,budget-snap.spent);
      for(const tg of priority){if(free<=0)break;if(tg.bal<=0)continue;const pay=Math.min(free,tg.bal);tg.bal-=pay;free-=pay;snap.extra+=pay;
        if(tg===other){snap.other.extra=pay}else{snap.loans[tg.id].extra=pay;snap.loans[tg.id].end=tg.bal;snap.principal+=pay}}
      snap.other.end=other.bal;snap.spent+=snap.extra;
      for(const l of [...loans,other]){if(l.bal<=0.5&&l.closed===null){l.closed=t;l.bal=0;snap.events.push(l.id);events.push({t,ym:ym(t),id:l.id,name:l.name,group:l.group})}}
      snap.totalStart=Object.values(snap.loans).reduce((n,x)=>n+x.start,0)+snap.other.start;
      snap.totalEnd=Object.values(snap.loans).reduce((n,x)=>n+x.end,0)+snap.other.end;
      months.push(snap);
      if(snap.totalEnd<=0.5)break;
    }
    const closedAt=id=>{const l=[...loans,other].find(x=>x.id===id);return l&&l.closed!==null?l.closed:Infinity};
    return {loans,other,budget,months,events,closedAt,ym};
  }
  // 눈덩이 없이 정해진 납입액만으로 갚을 때의 만기
  function plainPayoff(l){const r=mr(l),B=l.balance||0,P=l.monthlyPayment||0;if(!P)return Infinity;if(!r)return Math.ceil(B/P);if(r*B>=P)return Infinity;return Math.ceil(-Math.log(1-r*B/P)/Math.log(1+r))}
  function addYm(ym,m){const [y,mo]=ym.split("-").map(Number);const d=new Date(y,mo-1+m,1);return d.getFullYear()+"-"+pad(d.getMonth()+1)}
  const yrs=n=>{if(!isFinite(n))return"—";const y=Math.floor(n/12),mo=n%12;return (y?y+"년 ":"")+(mo?mo+"개월":"")||"0개월"};
  function groupAt(sim,m,group){
    const snap=sim.months[Math.min(m,sim.months.length-1)],done=m>=sim.months.length;
    const z={start:0,end:0,interest:0,sched:0,extra:0,principal:0,n:0};
    if(group==="other"){if(done)return z;return {start:snap.other.start,end:snap.other.end,interest:0,sched:0,extra:snap.other.extra,principal:snap.other.extra,n:1}}
    for(const l of sim.loans)if(l.group===group){if(done)continue;const x=snap.loans[l.id];z.start+=x.start;z.end+=x.end;z.interest+=x.interest;z.sched+=x.sched;z.extra+=x.extra;z.principal+=x.principal+x.extra;if(x.start>0)z.n++}
    return z;
  }
  function totalsAt(sim,m){
    if(m>=sim.months.length)return {start:0,end:0,interest:0,sched:0,extra:0,principal:0,pay:0};
    const s=sim.months[m];return {start:s.totalStart,end:s.totalEnd,interest:s.interest,sched:s.spent-s.extra,extra:s.extra,principal:s.principal,pay:s.spent};
  }

  function renderAssets(){
    const a=DATA.assets;if(!SIM)SIM=simulate(a);const sim=SIM;
    const price=st.price??a.apt.price,simPrice=st.simPrice??price,m=Math.max(0,monthsBetween(a.baseMonth,st.simYm));
    const m0=Math.min(curIdx(),sim.months.length-1),now=totalsAt(sim,m0),at=totalsAt(sim,m),same=m===m0&&simPrice===price;
    const G=g=>groupAt(sim,m0,g),S=g=>groupAt(sim,m,g);
    const nowM=G("mortgage"),nowA=G("amort"),nowIo=G("io"),nowO=G("other"),simM=S("mortgage"),simA=S("amort"),simIo=S("io"),simO=S("other");
    const net=price-now.start,simNet=simPrice-at.start;
    const mort=a.loans.find(l=>l.group==="mortgage")||{},mortId="L"+a.loans.indexOf(mort);
    const mortMat=plainPayoff(mort),mortSnow=sim.closedAt(mortId);
    const amortMat=Math.max(...a.loans.filter(l=>l.group==="amort").map(plainPayoff));
    const hcMax=Math.floor(now.interest/10000)*10000,hc=Math.min(hcMax,st.housing??(a.housingCost||0));
    const delta=(v,good,f=big)=>{if(same||Math.abs(v)<1)return"";const g=good?v>0:v<0;return`<small class="${g?"good":"bad"}">${v>0?"+":"−"}${f(Math.abs(v))}</small>`};
    const pct=(x,t)=>t?Math.round(x/t*100):0;
    const ymL=t=>isFinite(t)?ymLabel(addYm(a.baseMonth,t)):"—";
    const matL=n=>isFinite(n)?ymLabel(addYm(a.baseMonth,n-1)):"—";
    const loanRow=(name,sub,bal,pay,payNote,extra)=>`<div class="bd-loan"><div class="bd-loan-h"><span>${name} <small>${sub}</small></span><b>${big(bal)}${extra?`<small>${extra}</small>`:""}</b></div><div class="bd-loan-r"><span>매달</span><b>${won(pay)}</b><small>${payNote}</small></div></div>`;
    const ev=sim.events.map(e=>{const s=sim.months[e.t],after=s.extra;const nextName=(()=>{const nx=sim.months[Math.min(e.t+1,sim.months.length-1)];const tg=[...sim.loans].find(l=>nx.loans[l.id]&&nx.loans[l.id].extra>0);return tg?tg.name:(nx.other.extra>0?sim.other.name:"")})();
      return`<li class="${e.t<=m?"past":""}"><b>${ymLabel(e.ym)}</b><span>${esc(e.name)} 완납</span>${nextName?`<small>→ 이후 추가 상환은 ${esc(nextName)}</small>`:`<small>🎉 모든 빚 상환 끝</small>`}</li>`}).join("");
    const el=$(root,"#bd-assets");
    el.innerHTML=`
      <div class="bd-h"><h2>자산현황</h2><small>${ymLabel(addYm(a.baseMonth,m0))} 기준 · 이자·원금은 매달 자동 계산</small></div>
      <div class="bd-apt">
        <div class="bd-apt-row"><span>${esc(a.apt.name)} 매입가</span><b>${big(a.apt.purchase)}</b></div>
        <div class="bd-apt-row main"><span>시세</span><b>${big(price)}</b></div>
        <label class="bd-price">✎ 시세 바꿔보기 <span><input type="number" step="1000" min="0" inputmode="numeric" data-act="price" value="${Math.round(price/1e4)}"> 만원</span><button type="button" class="btn" data-act="price-reset">${big(a.apt.price)}으로</button></label>
      </div>
      <div class="bd-debt"><div class="bd-debt-h"><span>총 부채</span><b>${big(now.start)}</b></div>
        <div class="bd-debt-l"><span>🏠 주담대 ${big(nowM.start)}</span><span>📉 분할상환 ${big(nowA.start)}</span><span>💳 이자만 ${big(nowIo.start)}</span><span>👤 기타 ${big(nowO.start)}</span></div></div>
      <div class="bd-net ${net<0?"neg":""}"><span>최종 순자산 <small>= 시세 − 부채</small></span><b>${big(net)}</b></div>

      <div class="bd-pay" id="bd-pay">
        <div class="bd-pay-h"><span>매달 대출로 나가는 돈</span><b>${won(now.pay)}</b></div>
        <div class="bd-pay-bar bd-drag" data-act="hbar" title="주거비 경계를 끌어서 조절"><i class="h"></i><i class="i"></i><i class="p" style="width:${pct(now.principal,now.pay)}%"></i><b class="knob" data-k="knob" aria-hidden="true"></b></div>
        <div class="bd-pay-l"><span><em class="h"></em>주거비 <b data-k="hc"></b> <small data-k="hcp"></small></span><span><em class="i"></em>이자 <b data-k="int"></b> <small data-k="intp"></small></span><span><em class="p"></em>원금 <b>${won(now.principal)}</b> <small>(${pct(now.principal,now.pay)}%)</small></span></div>
        <p class="bd-foot">✎ 막대의 <b style="color:var(--accent)">주황 경계</b>를 좌우로 끌면 주거비를 바꿀 수 있어요 (0 ~ 월 이자 ${won(now.interest)}, 기본 ${big(a.housingCost||0)}원). ※ 이자 ${won(now.interest)} 중 <b data-k="hc3"></b>은 월세 대신 내는 <b>주거비</b>로 봤어요. 순수 이자 부담은 <b data-k="int2"></b>.</p>
      </div>

      <div class="bd-loans">
        ${loanRow("🏠 주택담보대출",`${esc(mort.bank||"")} · ${mort.rate||0}%`,nowM.start,nowM.sched,`이자 ${won(nowM.interest)} + 원금 ${won(nowM.principal)}`,`(만기 ${matL(mortMat)} · ${yrs(mortMat-m0)} 남음)`)}
        ${loanRow("📉 분할상환 대출",`캐피탈·신용 ${nowA.n}건`,nowA.start,nowA.sched,`이자 ${won(nowA.interest)} + 원금 ${won(nowA.principal)}`,`(만기 ${matL(amortMat)} · ${yrs(amortMat-m0)} 남음)`)}
        ${loanRow("💳 이자만 내는 대출",`마이너스통장·신용 ${nowIo.n}건 · 연장 유지`,nowIo.start,nowIo.interest,"이자만 · 원금 상환 없음","")}
        ${loanRow("👤 기타 채무",esc(sim.other.name),nowO.start,0,"이자 없음","")}
      </div>

      <details class="bd-sim" ${st.simOpen?"open":""}>
        <summary>🔭 시점 시뮬레이션 <small>시점·시세를 바꿔 보세요</small></summary>
        <div class="bd-sim-ctl"><label>시점 <input type="month" data-act="sim" value="${st.simYm}"></label><label>아파트 시세 <input type="number" step="1000" min="0" inputmode="numeric" data-act="sim-price" value="${Math.round(simPrice/1e4)}"> 만원</label><button type="button" class="btn" data-act="sim-reset">지금으로</button></div>
        <p class="bd-foot bd-rule">매달 대출에 쓰는 돈 <b>${won(sim.budget)}</b>은 그대로 두고, 대출이 하나 끝나면 거기 들어가던 돈을 다음 빚의 <b>추가 상환</b>에 얹는다고 가정했어요. 순서: 시뇽 명의 이자만 대출(잔액 작은 순) → 홍균 명의 이자만 대출 → 기타 채무 → 주담대. 이자만 대출을 갚으면 그 이자도 풀려서 점점 빨라져요.</p>
        <table class="bd-cmp"><thead><tr><th></th><th>지금</th><th>${ymLabel(st.simYm)}</th></tr></thead><tbody>
          <tr class="bd-legend"><td colspan="3">🏠 주택담보대출 · 📉 분할상환(원금+이자) · 💳 이자만 내는 대출 · 👤 기타 채무(무이자)</td></tr>
          <tr><td>시세</td><td>${big(price)}</td><td>${big(simPrice)}${delta(simPrice-price,true)}</td></tr>
          <tr><td>🏠 주담대 잔액<small>만기 ${matL(mortMat)}${isFinite(mortSnow)&&mortSnow<mortMat?` → 추가 상환 시 ${ymL(mortSnow)}`:""}</small></td><td>${big(nowM.start)}</td><td>${simM.start>0?big(simM.start)+delta(simM.start-nowM.start,false):"0"}</td></tr>
          ${a.loans.filter(l=>l.group==="amort").map((l,i)=>{const id="L"+a.loans.indexOf(l),x0=sim.months[m0].loans[id],x=m<sim.months.length?sim.months[m].loans[id]:{start:0,sched:0,extra:0};
            return`<tr><td>📉 ${esc(l.bank.includes(l.type)?l.bank:l.bank+" "+l.type)}<small>만기 ${matL(plainPayoff(l))}</small></td><td>${big(x0.start)}</td><td>${x.start>0?big(x.start)+delta(x.start-x0.start,false):"0"}</td></tr>`}).join("")}
          ${sim.loans.filter(l=>l.group==="io").map(l=>{const x0=sim.months[m0].loans[l.id],x=m<sim.months.length?sim.months[m].loans[l.id]:{start:0,interest:0,extra:0};const c=sim.closedAt(l.id);
            return`<tr><td>💳 ${esc(l.bank)} ${esc(l.type)}<small>${esc(l.owner)} · ${l.rate}%${isFinite(c)?` · 추가 상환 시 ${ymL(c)} 완납`:""}</small></td><td>${big(x0.start)}</td><td>${x.start>0?big(x.start)+delta(x.start-x0.start,false):"0"}</td></tr>`}).join("")}
          <tr><td>👤 기타 채무<small>${isFinite(sim.closedAt("OTHER"))?`추가 상환 시 ${ymL(sim.closedAt("OTHER"))} 완납`:"이자 없음"}</small></td><td>${big(nowO.start)}</td><td>${simO.start>0?big(simO.start)+(simO.extra?`<small class="good">추가 상환 −${won(simO.extra)}</small>`:delta(simO.start-nowO.start,false)):"0"}</td></tr>
          <tr class="bd-sum"><td>부채 총액</td><td>${big(now.start)}</td><td>${big(at.start)}${delta(at.start-now.start,false)}</td></tr>
          <tr class="bd-sum"><td>매달 대출 지출</td><td>${won(now.pay)}</td><td>${won(at.pay)}<small>이자 ${won(at.interest)}<br>원금 ${won(at.principal)}</small>${at.extra?`<small class="good">추가 상환 ${won(at.extra)} 포함</small>`:""}</td></tr>
          <tr class="bd-sum"><td>순자산</td><td>${big(net)}</td><td>${big(simNet)}${delta(simNet-net,true)}</td></tr>
        </tbody></table>
        <h3 class="bd-ev-h">📅 이대로 가면 빚이 사라지는 순서</h3>
        <ol class="bd-ev">${ev}</ol>
        <p class="bd-foot">대출 내역은 금융관리 시트 기준. 금리·납입액이 바뀌면 시트를 고쳐 주세요.</p>
      </details>`;
    paintHousing(el,now,hc);
  }
  function paintHousing(el,now,hc){
    const pct=(x,t)=>t?Math.round(x/t*100):0,q=k=>el.querySelector(`[data-k=${k}]`);
    const int=now.interest-hc;
    el.querySelector(".bd-pay-bar .h").style.width=pct(hc,now.pay)+"%";el.querySelector(".bd-pay-bar .i").style.width=pct(int,now.pay)+"%";
    q("hc").textContent=won(hc);q("hcp").textContent=`(${pct(hc,now.pay)}%)`;q("int").textContent=won(int);q("intp").textContent=`(${pct(int,now.pay)}%)`;
    q("hc3").textContent=won(hc);q("int2").textContent=won(int);const k=q("knob");if(k)k.style.left=(hc/now.pay*100)+"%";
  }

  // ───── 생활비 · 용돈 표 ─────
  function wallet(w,m,wid){
    const spent=w.rows.reduce((n,r)=>n+(r.spent||0),0),rec=w.rows.reduce((n,r)=>n+(r.rec||0),0);
    // 채운 돈: 아래 '채운 금액' 칸(budget_fill) + 예전 위쪽 '추가 금액'(budget_add)도 같은 돈으로 합쳐서 봄
    const fills=(w.fills||[]).map(f=>({...f,fixed:true})).concat(FILLS.concat(ADDS.map(x=>({...x,code:x.code||"추가 금액"}))).filter(f=>f.month===m.key&&f.wallet===wid).sort((a,b)=>(a.at||0)-(b.at||0)));
    const carry=(w.carry||[]),carrySum=carry.reduce((n,c)=>n+(Number(c.amount)||0),0);
    const filled=fills.reduce((n,f)=>n+(Number(f.amount)||0),0),bud=(w.budget||0)+filled+carrySum;
    const asOf=m.asOf||todayStr(),total=dayDiff(m.start,m.end)+1,elapsed=Math.min(total,Math.max(1,dayDiff(m.start,asOf)+1)),left=Math.max(0,total-elapsed);
    // 가용 금액 = 예산 + 채운 돈 − 쓴 돈. 초과분은 채운 돈에서 먼저 빠지고(퉁치고) 남은 만큼만 가용으로 남음
    const remain=bud-spent,pct=bud?spent/bud:0,perDay=left&&remain>0?Math.floor(remain/left/100)*100:0;
    const level=pct>=1?"over":pct>=.9?"warn90":pct>=.7?"warn70":"ok";
    const LV={ok:["여유 있음","var(--c-game)"],warn70:["주의 · 70% 넘음","var(--accent)"],warn90:["위험 · 90% 넘음","var(--late)"],over:["예산 초과","var(--late)"]}[level];
    const past=m.end<todayStr();
    // 총액 기준 = 권장 합계 + 채운 돈 − 지출 합계. 초과 항목은 항상 −초과.
    // 총액이 남으면 초과 안 한 항목에 필수(아래쪽)부터 배분하고, 그래도 남는 돈은 '채운 금액' 줄에 여유로 표시
    const base=rec+carrySum-spent,tot=base+filled,minus=tot<0;
    const alloc=new Map();let pool=Math.max(0,tot);
    for(let i=w.rows.length-1;i>=0;i--){const r=w.rows[i],room=(r.rec||0)-(r.spent||0);if(room<=0)continue;const give=Math.min(room,pool);alloc.set(i,give);pool-=give}
    // 항목 권장 한도를 다 채우고도 남는 돈(pool)
    const rows=w.rows.map((r,i)=>{const diff=(r.rec||0)-(r.spent||0),over=diff<0;
      const last=over?`<td class="over">−${num(-diff)}</td>`:past?`<td class="left">${num(diff)}</td>`:`<td class="${alloc.get(i)?"left":"zero"}">${num(alloc.get(i)||0)}</td>`;
      return`<tr><td>${r.icon?esc(r.icon)+" ":""}${esc(r.name)}</td><td>${num(r.rec)}</td><td class="${over?"over":""}">${num(r.spent)}</td>${last}</tr>`}).join("");
    const sumLast=minus?`<td class="over">−${num(-tot)}</td>`:`<td class="left">${num(tot)}</td>`;
    const gap=minus?-tot:0;
    const fillBox=`<div class="bd-fill-box${minus?"":" ok"}" data-wallet="${wid}">
        <div class="bd-fill-h"><b class="${base<0?"":"nz"}">${base<0?"초과 −"+won(-base):"총액 초과 없음"}</b><span class="${minus?"":"ok"}">${minus?won(gap)+" 부족":filled?"✓ 메우고 "+won(tot)+" 남음":"✓ 예산 안"}</span></div>
        ${fills.length?`<ul class="bd-fill-list">${fills.map(f=>`<li><span>${esc(f.code)}</span><b>+${won(f.amount)}</b>${f.byName?`<small>${esc(f.byName)}</small>`:""}${fdb&&!f.fixed?`<button type="button" class="btn del" data-act="fill-del" data-id="${esc(f.id)}" aria-label="삭제">×</button>`:""}</li>`).join("")}</ul>`:""}
        ${fdb?`<div class="bd-fill-add"><select data-f="code">${FILL_CODES.map(c=>`<option>${c}</option>`).join("")}</select><input type="text" inputmode="numeric" data-f="amt" placeholder="${gap>0?gap:"금액"}"><button type="button" class="btn pri" data-act="fill-add">확인</button></div>
        <p class="bd-foot">초과가 없어도 언제든 돈을 채워 넣을 수 있어요. 넣은 돈은 초과분부터 메우고, 남는 만큼 위의 가용 금액이 늘어요.${gap>0?" 금액을 비우고 확인을 누르면 부족분이 그대로 들어가요.":""}</p>`:`<p class="bd-foot">돈을 채워 넣으려면 일정표 웹에 로그인하세요.</p>`}
      </div>`;
    return`
      <div class="bd-h"><h2>${esc(w.title)}</h2><small>${md(m.start)} ~ ${md(m.end)}${past?" · 마감":" · "+esc(asOf)+" 기준"}</small></div>
      <div class="count lc bd-cards3">
        <div class="cd"><b class="${spent>0?"out":""}">${num(spent)}</b><span>쓴 돈<br>예산 ${num(w.budget)}${carrySum?`<br><em class="bd-plus">${carrySum<0?"−":"+"}이월 ${num(Math.abs(carrySum))}</em>`:""}${filled?`<br><em class="bd-plus">+채움 ${num(filled)}</em>`:""}</span></div>
        <div class="cd"><b class="${remain<0?"out":""}">${remain<0?"−"+num(-remain):num(remain)}</b><span>${past?"남긴 돈":"가용 금액<br>= 통장 잔액"}</span></div>
        <div class="cd main"><b>${past?Math.round(pct*100)+"%":num(perDay)}</b><span>${past?"예산 대비 사용":"하루 한도<br>"+left+"일 남음"}</span></div>
      </div>
      <div class="bd-badge" style="--lv:${LV[1]}">${LV[0]}</div>
      <div class="bd-prog" aria-hidden="true"><i class="bd-fill" style="width:${Math.min(100,pct*100).toFixed(1)}%;background:${LV[1]}"></i>${past?"":`<b class="bd-pace" style="left:${(elapsed/total*100).toFixed(1)}%"></b>`}<em style="left:70%"></em><em style="left:90%"></em></div>
      <div class="bd-prog-t"><span>${filled?"채운 돈 포함 ":"예산 "}${Math.round(pct*100)}% 사용</span><span>${past?total+"일 마감":"기간 "+Math.round(elapsed/total*100)+"% 경과 · "+elapsed+"일째"}</span></div>
      <table class="bd-table"><thead><tr><th>항목 <small>↓ 아래로 갈수록 필수</small></th><th>월 권장<small>원</small></th><th>${past?"지출":"현재 지출"}<small>원</small></th><th>${past?"결과":"남은 한도"}<small>${past?"원":"총액 기준 · 원"}</small></th></tr></thead>
      <tbody>${rows}${carrySum?`<tr class="bd-addrow"><td>↪ 이월·조정<small class="bd-carry">${carry.map(c=>esc(c.name)+" "+(c.amount<0?"−":"+")+num(Math.abs(c.amount))).join(" · ")}</small></td><td>${carrySum<0?"−":"+"}${num(Math.abs(carrySum))}</td><td></td><td></td></tr>`:""}${filled?`<tr class="bd-addrow"><td>💰 채운 금액</td><td>+${num(filled)}</td><td></td><td></td></tr>`:""}${pool>0&&!past?`<tr class="bd-free"><td>🆓 항목 밖 여유<small>어느 항목에 써도 되는 돈</small></td><td></td><td></td><td class="left">${num(pool)}</td></tr>`:""}<tr class="bd-sum"><td>합계</td><td>${num(rec+filled+carrySum)}</td><td class="${spent>rec+filled+carrySum?"over":""}">${num(spent)}</td>${sumLast}</tr></tbody></table>${fillBox}`;
  }
  function renderMonths(){
    const ms=DATA.months,m=ms[st.mi];
    const nav=`<div class="mon bd-mon"><button type="button" class="btn" data-act="m-prev" aria-label="이전 달"${st.mi<=0?" disabled":""}>‹</button><b>${md(m.start)} ~ ${md(m.end)}</b><button type="button" class="btn" data-act="m-next" aria-label="다음 달"${st.mi>=ms.length-1?" disabled":""}>›</button></div>`;
    const ph=m.placeholder?`<p class="bd-ph">🕓 새 달이 시작됐어요. 이번 달 내역은 아직 반영 전이라 지출이 0으로 보여요.</p>`:"";
    $(root,"#bd-living").innerHTML=nav+ph+wallet(m.living,m,"living");
    $(root,"#bd-allowance").innerHTML=wallet(m.allowance,m,"allowance");
  }

  function renderAll(){renderAssets();renderMonths()}

  window.initBudget=async function(el){
    root=el;
    el.innerHTML=`<section class="bd" id="bd-assets"></section><section class="bd" id="bd-living"></section><section class="bd" id="bd-allowance"></section>
      <p class="note">숫자는 Claude가 내역을 분석할 때마다 갱신합니다. 홍균·시뇽 둘만 볼 수 있어요.</p>`;
    try{const r=await fetch("budget.json?v="+Date.now(),{cache:"no-store"});if(!r.ok)throw 0;DATA=await r.json()}
    catch{el.innerHTML=`<p class="empty">가계부 데이터를 아직 불러오지 못했습니다.</p>`;return}
    DATA.months.sort((a,b)=>a.start.localeCompare(b.start));
    // 21일이 지나 새 달이 됐는데 아직 내역이 안 들어왔으면, 같은 권장 금액으로 빈 달을 자동으로 만들어 보여 줌
    const fmtD=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
    for(let guard=0;guard<24&&DATA.months[DATA.months.length-1].end<todayStr();guard++){
      const prev=DATA.months[DATA.months.length-1],e=parse(prev.end),s0=new Date(e.getFullYear(),e.getMonth(),e.getDate()+1),en=new Date(s0.getFullYear(),s0.getMonth()+1,20);
      const blank=w=>({title:w.title,budget:w.budget,balance:null,rows:w.rows.map(r=>({name:r.name,icon:r.icon,rec:r.rec,spent:0}))});
      DATA.months.push({key:fmtD(s0).slice(0,7),start:fmtD(s0),end:fmtD(en),asOf:todayStr(),placeholder:true,living:blank(prev.living),allowance:blank(prev.allowance)});
    }
    const cur=nowYm();st.simYm=cur>DATA.assets.baseMonth?cur:DATA.assets.baseMonth;
    st.mi=Math.max(0,DATA.months.findIndex(m=>m.start<=todayStr()&&todayStr()<=m.end));
    if(st.mi<0)st.mi=DATA.months.length-1;
    try{if(window.firebase&&firebase.apps&&firebase.apps.length){fdb=firebase.firestore();const au=firebase.auth();fme=()=>{const u=au.currentUser;return u?(u.displayName||u.email||"").split(" ")[0]:""};
      fdb.collection("genesis_tasks").where("kind","in",["budget_fill","budget_add"]).onSnapshot(q=>{const all=q.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.at||0)-(b.at||0));FILLS=all.filter(x=>x.kind==="budget_fill");ADDS=all.filter(x=>x.kind==="budget_add");renderMonths()})}}catch{}
    renderAll();
    el.addEventListener("toggle",e=>{if(e.target.classList&&e.target.classList.contains("bd-sim"))st.simOpen=e.target.open},true);
    (()=>{let drag=false;const bar=()=>el.querySelector("[data-act=hbar]");
      const setFrom=(ev)=>{const b=bar();if(!b||!SIM)return;const r=b.getBoundingClientRect(),now=totalsAt(SIM,Math.min(curIdx(),SIM.months.length-1));let v=(ev.clientX-r.left)/r.width*now.pay;v=Math.round(Math.max(0,Math.min(now.interest,v))/10000)*10000;st.housing=v;paintHousing($(root,"#bd-assets"),now,v)};
      el.addEventListener("pointerdown",ev=>{if(!ev.target.closest("[data-act=hbar]"))return;drag=true;ev.preventDefault();setFrom(ev)});
      el.addEventListener("pointermove",ev=>{if(drag)setFrom(ev)});
      window.addEventListener("pointerup",()=>{drag=false});window.addEventListener("pointercancel",()=>{drag=false});})();
    el.addEventListener("click",async e=>{const b=e.target.closest("button[data-act^=add-]");if(!b||!fdb)return;const m=DATA.months[st.mi];
      if(b.dataset.act==="add-del"){if(b.dataset.confirm!=="1"){b.dataset.confirm="1";b.textContent="삭제?";return}try{await fdb.collection("genesis_tasks").doc(b.dataset.id).delete()}catch{}return}
      const box=b.closest(".bd-add"),inp=box.querySelector("[data-f=add-amt]"),amt=Math.round(Number(String(inp.value).replace(/[^0-9]/g,""))||0);if(!amt)return;
      b.disabled=true;try{await fdb.collection("genesis_tasks").add({kind:"budget_add",month:m.key,wallet:box.dataset.wallet,amount:amt,byName:fme(),at:Date.now()})}catch{}b.disabled=false});
    el.addEventListener("click",async e=>{const b=e.target.closest("button[data-act^=fill-]");if(!b||!fdb)return;const box=b.closest(".bd-fill-box"),m=DATA.months[st.mi];
      if(b.dataset.act==="fill-del"){if(b.dataset.confirm!=="1"){b.dataset.confirm="1";b.textContent="삭제?";return}try{await fdb.collection("genesis_tasks").doc(b.dataset.id).delete()}catch{}return}
      const code=box.querySelector("[data-f=code]").value,inp=box.querySelector("[data-f=amt]");let amt=Math.round(Number(String(inp.value).replace(/[^0-9]/g,""))||0);
      if(!amt)amt=Number(inp.placeholder)||0;if(!amt)return;
      b.disabled=true;try{await fdb.collection("genesis_tasks").add({kind:"budget_fill",month:m.key,wallet:box.dataset.wallet,code,amount:amt,byName:fme(),at:Date.now()})}catch{}b.disabled=false});
    el.addEventListener("input",e=>{const t=e.target;if(t.dataset.act==="price"){const v=Number(t.value)*1e4;if(v>0){st.price=v;st.simPrice=null;renderAssets();$(root,"[data-act=price]").focus()}}
      if(t.dataset.act==="sim"&&/^\d{4}-\d{2}$/.test(t.value)){st.simYm=t.value;renderAssets()}
      if(t.dataset.act==="sim-price"){const v=Number(t.value)*1e4;if(v>0){st.simPrice=v;renderAssets();$(root,"[data-act=sim-price]").focus()}}});
    el.addEventListener("click",e=>{const b=e.target.closest("button[data-act]");if(!b)return;const a=b.dataset.act;
      if(a==="price-reset"){st.price=null;renderAssets()}
      else if(a==="sim-reset"){st.simYm=addYm(DATA.assets.baseMonth,curIdx());st.simPrice=null;st.simOpen=true;renderAssets()}
      else if(a==="m-prev"&&st.mi>0){st.mi--;renderMonths()}
      else if(a==="m-next"&&st.mi<DATA.months.length-1){st.mi++;renderMonths()}});
  };
})();
