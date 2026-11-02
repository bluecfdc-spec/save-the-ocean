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

  let DATA=null,root=null,FILLS=[],fdb=null,fme=()=>"";
const FILL_CODES=["할부","대출","시뇽 비상자금","야근 보너스","기타"];
  const st={price:null,simYm:null,simPrice:null,mi:0};

  // ───── 자산현황 ─────
  // 대출 계산. 분할상환(주담대·캐피탈·전북): 실제 월 납입액(시트) 고정, 이자=잔액×월이율, 원금=납입액−이자 → 잔액이 0이 되는 달이 완납.
  // 이자만 내는 대출(마통·신용): 연장 가정, 잔액 고정·이자만. 기타 채무: 이자 없음.
  const mr=l=>(l.rate||0)/100/12;
  function payoffMonths(l){const r=mr(l),B=l.balance||0,P=l.monthlyPayment||0;if(!P)return Infinity;if(!r)return Math.ceil(B/P);if(r*B>=P)return Infinity;return Math.ceil(-Math.log(1-r*B/P)/Math.log(1+r))}
  function loanAt(l,m){
    const r=mr(l),B=l.balance||0;
    if(l.group==="io"){return {bal:B,interest:B*r,principal:0,pay:B*r}}
    const P=l.monthlyPayment||0,n=payoffMonths(l);
    if(m>=n)return {bal:0,interest:0,principal:0,pay:0};
    const g=Math.pow(1+r,m),bal=Math.max(0,r?B*g-P*(g-1)/r:B-P*m),interest=bal*r;
    return {bal,interest,principal:Math.min(bal,P-interest),pay:Math.min(P,bal+interest)};
  }
  function addYm(ym,m){const [y,mo]=ym.split("-").map(Number);const d=new Date(y,mo-1+m,1);return d.getFullYear()+"-"+pad(d.getMonth()+1)}
  function debtAt(a,ym){
    const m=monthsBetween(a.baseMonth,ym),g={mortgage:z(),amort:z(),io:z()};
    function z(){return {bal:0,interest:0,principal:0,pay:0}}
    for(const l of a.loans){const x=loanAt(l,m),t=g[l.group]||g.amort;t.bal+=x.bal;t.interest+=x.interest;t.principal+=x.principal;t.pay+=x.pay}
    const other=(a.otherDebts||[]).reduce((n,d)=>n+(d.amount||0),0);
    const interest=g.mortgage.interest+g.amort.interest+g.io.interest,principal=g.mortgage.principal+g.amort.principal;
    return {...g,other,total:g.mortgage.bal+g.amort.bal+g.io.bal+other,interest,principal,pay:interest+principal};
  }
  const yrs=n=>{if(!isFinite(n))return"—";const y=Math.floor(n/12),mo=n%12;return (y?y+"년 ":"")+(mo?mo+"개월":"")||"0개월"};
  function groupPayoff(a,group){let n=0;for(const l of a.loans)if(l.group===group)n=Math.max(n,payoffMonths(l));return n}

  function renderAssets(){
    const a=DATA.assets,price=st.price??a.apt.price,simPrice=st.simPrice??price,now=debtAt(a,a.baseMonth),sim=debtAt(a,st.simYm);
    const net=price-now.total,simNet=simPrice-sim.total,same=st.simYm===a.baseMonth&&simPrice===price;
    const nM=groupPayoff(a,"mortgage"),nA=groupPayoff(a,"amort"),mort=a.loans.find(l=>l.group==="mortgage")||{},ioN=a.loans.filter(l=>l.group==="io").length,amN=a.loans.filter(l=>l.group==="amort").length;
    const delta=(v,good,f=big)=>{if(same||Math.abs(v)<1)return"";const g=good?v>0:v<0;return`<small class="${g?"good":"bad"}">${v>0?"+":"−"}${f(Math.abs(v))}</small>`};
    const pct=(x,t)=>t?Math.round(x/t*100):0;const hc=Math.min(now.interest,a.housingCost||0);const mEnd=isFinite(nM)?ymLabel(addYm(a.baseMonth,nM)):"—";
    const el=$(root,"#bd-assets");
    el.innerHTML=`
      <div class="bd-h"><h2>자산현황</h2><small>${ymLabel(a.baseMonth)} 기준 · ${esc(DATA.updated)} 갱신</small></div>
      <div class="bd-apt">
        <div class="bd-apt-row"><span>${esc(a.apt.name)} 매입가</span><b>${big(a.apt.purchase)}</b></div>
        <div class="bd-apt-row main"><span>시세</span><b>${big(price)}</b></div>
        <label class="bd-price">✎ 시세 바꿔보기 <span><input type="number" step="1000" min="0" inputmode="numeric" data-act="price" value="${Math.round(price/1e4)}"> 만원</span><button type="button" class="btn" data-act="price-reset">${big(a.apt.price)}으로</button></label>
      </div>
      <div class="bd-net ${net<0?"neg":""}"><span>최종 순자산 <small>= 시세 − 부채</small></span><b>${big(net)}</b></div>

      <div class="bd-pay">
        <div class="bd-pay-h"><span>매달 대출로 나가는 돈</span><b>${won(now.pay)}</b></div>
        <div class="bd-pay-bar" aria-hidden="true"><i class="h" style="width:${pct(hc,now.pay)}%"></i><i class="i" style="width:${pct(now.interest-hc,now.pay)}%"></i><i class="p" style="width:${pct(now.principal,now.pay)}%"></i></div>
        <div class="bd-pay-l"><span><em class="h"></em>주거비 ${won(hc)} <small>(${pct(hc,now.pay)}%)</small></span><span><em class="i"></em>이자 ${won(now.interest-hc)} <small>(${pct(now.interest-hc,now.pay)}%)</small></span><span><em class="p"></em>원금 ${won(now.principal)} <small>(${pct(now.principal,now.pay)}%)</small></span></div>
        <p class="bd-foot">※ 이자 ${won(now.interest)} 중 약 ${big(hc)}원은 월세 대신 내는 <b>주거비</b>로 봤어요. 순수 이자 부담은 ${won(now.interest-hc)}.</p>
      </div>

      <div class="bd-loans">
        <div class="bd-loan">
          <div class="bd-loan-h"><span>🏠 주택담보대출 <small>${esc(mort.bank||"")} · ${mort.rate||0}%</small></span><b>${big(now.mortgage.bal)}<small>(만기 ${mEnd} · ${yrs(nM)} 남음)</small></b></div>
          <div class="bd-loan-r"><span>매달</span><b>${won(now.mortgage.pay)}</b><small>이자 ${won(now.mortgage.interest)} + 원금 ${won(now.mortgage.principal)}</small></div>
        </div>
        <div class="bd-loan">
          <div class="bd-loan-h"><span>📉 분할상환 대출 <small>캐피탈·신용 ${amN}건</small></span><b>${big(now.amort.bal)}<small>(만기 ${isFinite(nA)?ymLabel(addYm(a.baseMonth,nA)):"—"} · ${yrs(nA)} 남음)</small></b></div>
          <div class="bd-loan-r"><span>매달</span><b>${won(now.amort.pay)}</b><small>이자 ${won(now.amort.interest)} + 원금 ${won(now.amort.principal)}</small></div>
        </div>
        <div class="bd-loan">
          <div class="bd-loan-h"><span>💳 이자만 내는 대출 <small>마이너스통장·신용 ${ioN}건 · 연장 가정</small></span><b>${big(now.io.bal)}</b></div>
          <div class="bd-loan-r"><span>매달</span><b>${won(now.io.interest)}</b><small>이자만 · 원금 상환 없음</small></div>
        </div>
        <div class="bd-loan">
          <div class="bd-loan-h"><span>👤 기타 채무 <small>${(a.otherDebts||[]).map(d=>esc(d.name)).join(", ")}</small></span><b>${big(now.other)}</b></div>
          <div class="bd-loan-r"><span>매달</span><b>0원</b><small>이자 없음</small></div>
        </div>
      </div>

      <details class="bd-sim" ${same?"":"open"}>
        <summary>🔭 시점 시뮬레이션 <small>시점·시세를 바꿔 보세요</small></summary>
        <div class="bd-sim-ctl"><label>시점 <input type="month" data-act="sim" value="${st.simYm}"></label><label>아파트 시세 <input type="number" step="1000" min="0" inputmode="numeric" data-act="sim-price" value="${Math.round(simPrice/1e4)}"> 만원</label><button type="button" class="btn" data-act="sim-reset">지금으로</button></div>
        <table class="bd-cmp"><thead><tr><th></th><th>지금</th><th>${ymLabel(st.simYm)}</th></tr></thead><tbody>
          <tr><td>시세</td><td>${big(price)}</td><td>${big(simPrice)}${delta(simPrice-price,true)}</td></tr>
          <tr><td>🏠 주담대 잔액<small>만기 ${mEnd}</small></td><td>${big(now.mortgage.bal)}</td><td>${big(sim.mortgage.bal)}${delta(sim.mortgage.bal-now.mortgage.bal,false)}</td></tr>
          <tr class="bd-sub"><td>└ 매달 (이자+원금)</td><td>${won(now.mortgage.pay)}</td><td>${won(sim.mortgage.pay)}</td></tr>
          <tr><td>📉 분할상환 잔액<small>만기 ${isFinite(nA)?ymLabel(addYm(a.baseMonth,nA)):"—"}</small></td><td>${big(now.amort.bal)}</td><td>${big(sim.amort.bal)}${delta(sim.amort.bal-now.amort.bal,false)}</td></tr>
          <tr class="bd-sub"><td>└ 매달 (이자+원금)</td><td>${won(now.amort.pay)}</td><td>${won(sim.amort.pay)}</td></tr>
          <tr><td>💳 이자만 대출<small>연장 유지</small></td><td>${big(now.io.bal)}</td><td>${big(sim.io.bal)}</td></tr>
          <tr class="bd-sub"><td>└ 매달 이자</td><td>${won(now.io.interest)}</td><td>${won(sim.io.interest)}</td></tr>
          <tr><td>👤 기타 채무</td><td>${big(now.other)}</td><td>${big(sim.other)}</td></tr>
          <tr class="bd-sum"><td>부채 총액</td><td>${big(now.total)}</td><td>${big(sim.total)}${delta(sim.total-now.total,false)}</td></tr>
          <tr class="bd-sum"><td>매달 대출 지출</td><td>${won(now.pay)}</td><td>${won(sim.pay)}${delta(sim.pay-now.pay,false,won)}</td></tr>
          <tr class="bd-sum"><td>순자산</td><td>${big(net)}</td><td>${big(simNet)}${delta(simNet-net,true)}</td></tr>
        </tbody></table>
        <p class="bd-foot">분할상환 대출은 지금 내는 월 납입액이 그대로 이어진다고 보고(이자는 줄고 원금은 늘어남), 잔액이 0이 되는 달을 완납으로 잡았어요. 이자만 내는 대출은 연장한다고 보고 잔액과 이자를 그대로 뒀어요. 그래서 분할상환이 다 끝나도 이자만 내는 대출의 이자(매달 ${won(now.io.interest)})는 계속 나가요. 대출 내역은 금융관리 시트 기준.</p>
      </details>`;
  }

  // ───── 생활비 · 용돈 표 ─────
  function wallet(w,m,wid){
    const spent=w.rows.reduce((n,r)=>n+(r.spent||0),0),rec=w.rows.reduce((n,r)=>n+(r.rec||0),0);
    const asOf=m.asOf||todayStr(),total=dayDiff(m.start,m.end)+1,elapsed=Math.min(total,Math.max(1,dayDiff(m.start,asOf)+1)),left=Math.max(0,total-elapsed);
    const pct=w.budget?spent/w.budget:0,remain=w.balance!=null?w.balance:w.budget-spent,perDay=left?Math.floor(remain/left/100)*100:0;
    const level=pct>=1?"over":pct>=.9?"warn90":pct>=.7?"warn70":"ok";
    const LV={ok:["여유 있음","var(--c-game)"],warn70:["주의 · 70% 넘음","var(--accent)"],warn90:["위험 · 90% 넘음","var(--late)"],over:["예산 초과","var(--late)"]}[level];
    const past=m.end<todayStr();
    // 총액 기준 = 권장 합계 − 지출 합계. 초과 항목은 항상 −초과.
    // 총액이 1원이라도 남으면 초과 안 한 항목에 필수(아래쪽)부터 배분, 총액이 마이너스면 나머지는 전부 0.
    const tot=rec-spent,minus=tot<0;
    const alloc=new Map();let pool=Math.max(0,tot);
    for(let i=w.rows.length-1;i>=0;i--){const r=w.rows[i],room=(r.rec||0)-(r.spent||0);if(room<=0)continue;const give=Math.min(room,pool);alloc.set(i,give);pool-=give}
    const rows=w.rows.map((r,i)=>{const diff=(r.rec||0)-(r.spent||0),over=diff<0;
      const last=over?`<td class="over">−${num(-diff)}</td>`:past?`<td class="left">${num(diff)}</td>`:`<td class="${alloc.get(i)?"left":"zero"}">${num(alloc.get(i)||0)}</td>`;
      return`<tr><td>${r.icon?esc(r.icon)+" ":""}${esc(r.name)}</td><td>${num(r.rec)}</td><td class="${over?"over":""}">${num(r.spent)}</td>${last}</tr>`}).join("");
    const sumLast=minus?`<td class="over">−${num(-tot)}</td>`:`<td class="left">${num(tot)}</td>`;
    const fills=FILLS.filter(f=>f.month===m.key&&f.wallet===wid),filled=fills.reduce((n,f)=>n+(Number(f.amount)||0),0),gap=minus?-tot-filled:0;
    const fillBox=!minus?"":`<div class="bd-fill-box" data-wallet="${wid}">
        <div class="bd-fill-h"><b>총 −${won(-tot)}</b><span class="${gap<=0?"ok":""}">${gap<=0?"✓ 0원으로 맞춤":won(gap)+" 부족"}</span></div>
        ${fills.length?`<ul class="bd-fill-list">${fills.map(f=>`<li><span>${esc(f.code)}</span><b>+${won(f.amount)}</b>${f.byName?`<small>${esc(f.byName)}</small>`:""}<button type="button" class="btn del" data-act="fill-del" data-id="${esc(f.id)}" aria-label="삭제">×</button></li>`).join("")}</ul>`:""}
        ${fdb?`<div class="bd-fill-add"><select data-f="code">${FILL_CODES.map(c=>`<option>${c}</option>`).join("")}</select><input type="text" inputmode="numeric" data-f="amt" placeholder="${gap>0?Math.max(0,gap):""}"><button type="button" class="btn pri" data-act="fill-add">확인</button></div>
        <p class="bd-foot">어떻게 메웠는지 적어 두는 칸이에요(선택). 금액을 비우고 확인을 누르면 남은 부족분이 그대로 들어가요.</p>`:`<p class="bd-foot">어떻게 메웠는지는 일정표 웹에 로그인하면 적을 수 있어요.</p>`}
      </div>`;
    return`
      <div class="bd-h"><h2>${esc(w.title)}</h2><small>${md(m.start)} ~ ${md(m.end)}${past?" · 마감":" · "+esc(asOf)+" 기준"}</small></div>
      <div class="count lc bd-cards3">
        <div class="cd"><b class="out">${big(spent)}</b><span>쓴 돈 / ${big(w.budget)}</span></div>
        <div class="cd"><b>${big(remain)}</b><span>${past?"남긴 돈":"통장 잔액"}</span></div>
        <div class="cd main"><b>${past?Math.round(pct*100)+"%":big(perDay)}</b><span>${past?"예산 대비 사용":"하루 한도 · "+left+"일 남음"}</span></div>
      </div>
      <div class="bd-badge" style="--lv:${LV[1]}">${LV[0]}</div>
      <div class="bd-prog" aria-hidden="true"><i class="bd-fill" style="width:${Math.min(100,pct*100).toFixed(1)}%;background:${LV[1]}"></i>${past?"":`<b class="bd-pace" style="left:${(elapsed/total*100).toFixed(1)}%"></b>`}<em style="left:70%"></em><em style="left:90%"></em></div>
      <div class="bd-prog-t"><span>예산 ${Math.round(pct*100)}% 사용</span><span>${past?total+"일 마감":"기간 "+Math.round(elapsed/total*100)+"% 경과 · "+elapsed+"일째"}</span></div>
      <table class="bd-table"><thead><tr><th>항목 <small>↓ 아래로 갈수록 필수</small></th><th>월 권장<small>원</small></th><th>${past?"지출":"현재 지출"}<small>원</small></th><th>${past?"결과":"남은 한도"}<small>${past?"원":"총액 기준 · 원"}</small></th></tr></thead>
      <tbody>${rows}<tr class="bd-sum"><td>합계</td><td>${num(rec)}</td><td class="${spent>rec?"over":""}">${num(spent)}</td>${sumLast}</tr></tbody></table>${fillBox}`;
  }
  function renderMonths(){
    const ms=DATA.months,m=ms[st.mi];
    const nav=`<div class="mon bd-mon"><button type="button" class="btn" data-act="m-prev" aria-label="이전 달"${st.mi<=0?" disabled":""}>‹</button><b>${md(m.start)} ~ ${md(m.end)}</b><button type="button" class="btn" data-act="m-next" aria-label="다음 달"${st.mi>=ms.length-1?" disabled":""}>›</button></div>`;
    $(root,"#bd-living").innerHTML=nav+wallet(m.living,m,"living");
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
    const cur=nowYm();st.simYm=DATA.assets.baseMonth;
    st.mi=Math.max(0,DATA.months.findIndex(m=>m.start<=todayStr()&&todayStr()<=m.end));
    if(st.mi<0)st.mi=DATA.months.length-1;
    try{if(window.firebase&&firebase.apps&&firebase.apps.length){fdb=firebase.firestore();const au=firebase.auth();fme=()=>{const u=au.currentUser;return u?(u.displayName||u.email||"").split(" ")[0]:""};
      fdb.collection("genesis_tasks").where("kind","==","budget_fill").onSnapshot(q=>{FILLS=q.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.at||0)-(b.at||0));renderMonths()})}}catch{}
    renderAll();
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
      else if(a==="sim-reset"){st.simYm=DATA.assets.baseMonth;st.simPrice=null;renderAssets()}
      else if(a==="m-prev"&&st.mi>0){st.mi--;renderMonths()}
      else if(a==="m-next"&&st.mi<DATA.months.length-1){st.mi++;renderMonths()}});
  };
})();
