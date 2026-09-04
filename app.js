(() => {
  "use strict";

  // ——— Config — Oxyy ———
  // Oxyy is called by the same-origin Pages Function; credentials never enter the browser.
  const BASE_URL = "/api";
  const MODEL = (window.OXY_MODEL || window.GEMINI_MODEL || "nano-banana-2").trim();
  const DISPLAY_MODEL = "Nano Banana Pro";
  // The browser uses a single logical proxy slot; credentials remain server-side.
  // Keep one logical slot so the existing loading/failover UI remains intact.
  const KEYS = ["proxy"];

  // ——— DOM ———
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const conversation = $("#conversation");
  const thread = $("#thread");
  const hero = $("#hero");
  const promptInput = $("#promptInput");
  const generateBtn = $("#generateBtn");
  const composerForm = $("#composerForm");
  const composerShell = $("#composerShell");
  const fileInput = $("#fileInput");
  const attachBtn = $("#attachBtn");
  const refPreview = $("#refPreview");
  const refPreviewImg = $("#refPreviewImg");
  const refPreviewName = $("#refPreviewName");
  const refPreviewSize = $("#refPreviewSize");
  const refRemove = $("#refRemove");
  const ratioRow = $("#ratioRow");
  const resRow = $("#resRow");
  const keyIndicator = $("#keyIndicator");
  const keyDots = $("#keyDots");
  const keyIndicatorText = $("#keyIndicatorText");
  const historyToggle = $("#historyToggle");
  const historyPanel = $("#historyPanel");
  const historyBackdrop = $("#historyBackdrop");
  const historyClose = $("#historyClose");
  const historyGrid = $("#historyGrid");
  const historyEmpty = $("#historyEmpty");
  const historyCount = $("#historyCount");
  const historySubtitle = $("#historySubtitle");
  const clearHistoryBtn = $("#clearHistory");
  const exportHistoryBtn = $("#exportHistory");
  const clearBtn = $("#clearBtn");
  const toastRegion = $("#toastRegion");
  const dragOverlay = $("#dragOverlay");
  const lightbox = $("#lightbox");
  const lightboxImg = $("#lightboxImg");
  const lightboxCaption = $("#lightboxCaption");
  const lightboxBackdrop = $("#lightboxBackdrop");
  const lightboxClose = $("#lightboxClose");
  const lightboxDownload = $("#lightboxDownload");

  // ——— State ———
  let aspectRatio = "1:1";
  let resolution = "1K";
  let reference = null;
  let isGenerating = false;
  let lastPrompt = null;
  let lastSettings = null;
  let lastReferenceForRetry = null;
  const HISTORY_KEY = "shilo_workspace_history_v2";
  let history = [];

  const keyState = KEYS.map(() => ({
    failures: 0,
    cooldownUntil: 0,
    lastSuccess: 0,
    lastFailure: 0,
  }));
  let lastSuccessfulKey = -1;
  let busyKey = -1;

  const RATIOS = ["1:1","16:9","9:16","4:3","3:4","3:2","2:3","21:9"];
  const MAX_PROMPT = 4000;
  const COOLDOWN = {
    429: 45_000,
    500: 18_000,
    503: 18_000,
    network: 12_000,
    generic: 10_000
  };

  function init() {
    renderRatioPills();
    renderKeyDots();
    updateKeyIndicator();
    loadHistory();
    renderHistory();
    bindEvents();
    autoGrow(promptInput);
    promptInput.focus({ preventScroll: true });
    if (KEYS.length === 0) {
      showToast("Configure OXY_API_KEY in the Pages Function to start generating.", "error");
    }
    // Update static branding if present
    const brandSub = document.querySelector(".brand-sub");
    if (brandSub) brandSub.textContent = DISPLAY_MODEL;
    const heroEyebrow = document.querySelector(".hero-eyebrow");
    if (heroEyebrow) heroEyebrow.innerHTML = '<span class="eyebrow-dot" aria-hidden="true"></span> ' + DISPLAY_MODEL + ' · 60 credits/image · Oxyy';
    initPolish();
    initMacDopamine();
  }

  function initPolish(){
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    const phRotator = (() => {
      const prompts = [
        "Describe what you want to create…",
        "A brutalist library, warm wood and concrete, volumetric light…",
        "Editorial portrait, Paris street, shallow depth of field…",
        "Tea house at dawn, mist over koi pond…",
        "Matte black vase on limestone plinth, studio lighting…"
      ];
      let idx = 0, deleting = false, txt = "", charIdx = 0;
      let timer;
      function tick(){
        const full = prompts[idx];
        if (!deleting){
          txt = full.slice(0, charIdx + 1);
          charIdx++;
          if (charIdx === full.length){
            deleting = false;
            clearTimeout(timer);
            timer = setTimeout(()=>{ deleting = true; tick(); }, 1600);
            update();
            return;
          }
        } else {
          txt = full.slice(0, charIdx - 1);
          charIdx--;
          if (charIdx === 0){
            deleting = false;
            idx = (idx + 1) % prompts.length;
          }
        }
        update();
        const delay = deleting ? 28 : 34;
        timer = setTimeout(tick, delay);
      }
      function update(){
        if (document.activeElement === promptInput || promptInput.value) return;
        promptInput.setAttribute("placeholder", txt || " ");
      }
      let idleTimer;
      function schedule(){
        clearTimeout(idleTimer);
        idleTimer = setTimeout(tick, 2200);
      }
      promptInput.addEventListener("focus", () => { clearTimeout(timer); clearTimeout(idleTimer); promptInput.setAttribute("placeholder", "Describe what you want to create…"); });
      promptInput.addEventListener("blur", schedule);
      promptInput.addEventListener("input", () => { if (promptInput.value) { clearTimeout(timer); promptInput.setAttribute("placeholder"," "); } });
      schedule();
    })();

    document.querySelectorAll(".suggestion").forEach(el=>{
      el.addEventListener("pointermove", e=>{
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", ((e.clientX - r.left)/r.width*100)+"%");
      });
    });

    let raf = null;
    const heroEl = document.querySelector(".hero");
    const composer = document.querySelector(".composer");
    if (heroEl && composer){
      window.addEventListener("pointermove", e=>{
        if (window.innerWidth < 760) return;
        if (raf) return;
        raf = requestAnimationFrame(()=>{
          raf = null;
          const cx = window.innerWidth/2, cy = window.innerHeight/2;
          const dx = (e.clientX - cx)/cx, dy = (e.clientY - cy)/cy;
          heroEl.style.setProperty("--px", dx.toFixed(3));
          heroEl.style.setProperty("--py", dy.toFixed(3));
          composer.style.transform = `translate3d(${dx*2.2}px, ${dy*1.2}px, 0)`;
          document.body.style.setProperty("--mx", e.clientX+"px");
          document.body.style.setProperty("--my", e.clientY+"px");
        });
      });
      window.addEventListener("pointerleave", ()=>{
        composer.style.transform = "";
      });
    }

    const io = new IntersectionObserver((entries)=>{
      entries.forEach(ent=>{
        if (ent.isIntersecting){
          ent.target.style.willChange = "transform, opacity";
          ent.target.animate?.([
            {opacity:0, transform:"translateY(10px) scale(0.99)"},
            {opacity:1, transform:"none"}
          ],{duration:420, easing:"cubic-bezier(.16,1,.3,1)"});
          io.unobserve(ent.target);
        }
      });
    },{threshold:0.12});
    const observeThread = ()=>{
      thread.querySelectorAll(".message:not([data-observed])").forEach(m=>{
        m.dataset.observed="1";
        io.observe(m);
      });
    };
    new MutationObserver(observeThread).observe(thread,{childList:true});
    observeThread();

    const cardiObserver = new MutationObserver(()=>{
      thread.querySelectorAll(".gen-card:not([data-tilt])").forEach(card=>{
        card.dataset.tilt="1";
        const media = card.querySelector(".gen-card-media");
        if (!media) return;
        let bounds;
        card.addEventListener("pointermove", e=>{
          if (window.matchMedia("(pointer: coarse)").matches) return;
          bounds = bounds || card.getBoundingClientRect();
          const x = (e.clientX - bounds.left)/bounds.width - 0.5;
          const y = (e.clientY - bounds.top)/bounds.height - 0.5;
          card.style.transform = `perspective(900px) rotateX(${(-y*2.2).toFixed(2)}deg) rotateY(${(x*3.2).toFixed(2)}deg) translateY(-1px)`;
          media.style.setProperty("--tx", (x*8)+"px");
        });
        card.addEventListener("pointerleave", ()=>{
          card.style.transform = "";
          bounds = null;
        });
        card.addEventListener("pointerenter", ()=>{ bounds = card.getBoundingClientRect(); });
      });
    });
    cardiObserver.observe(thread,{childList:true, subtree:true});

    const ripple = (e)=>{
      const t = e.currentTarget;
      if (t.disabled) return;
      const rect = t.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const s = document.createElement("span");
      s.style.cssText = `position:absolute; left:${x}px; top:${y}px; width:12px; height:12px; margin:-6px; border-radius:50%; background: radial-gradient(circle, rgba(255,255,255,0.42), transparent 72%); pointer-events:none; transform:scale(0); opacity:0.9;`;
      t.style.position = "relative"; t.style.overflow = "hidden";
      t.appendChild(s);
      s.animate([{transform:"scale(0)", opacity:0.9},{transform:"scale(14)", opacity:0}],{duration:520, easing:"cubic-bezier(.16,1,.3,1)"}).onfinish=()=>s.remove();
    };
    document.querySelectorAll(".btn, .generate-btn, .icon-btn, .pill, .suggestion").forEach(b=>{
      b.addEventListener("click", ripple);
    });

    const countEl = document.getElementById("historyCount");
    if (countEl){
      const origRender = renderHistory;
      window._renderHistoryBump = ()=>{
        countEl.animate?.([{transform:"scale(1)"},{transform:"scale(1.18)"},{transform:"scale(1)"}],{duration:320, easing:"cubic-bezier(.34,1.56,.64,1)"});
      };
    }

    document.querySelectorAll(".topbar-actions .icon-btn, .key-indicator").forEach(el=>{
      el.addEventListener("pointerenter", ()=>{
        el.animate?.([{transform:"translateY(0)"},{transform:"translateY(-1px)"}],{duration:160, easing:"ease-out"});
      });
    });

    let tick = false;
    window.addEventListener("scroll", ()=>{
      if (tick) return;
      tick = true;
      requestAnimationFrame(()=>{
        tick = false;
        const y = window.scrollY;
        const topbar = document.querySelector(".topbar");
        if (topbar){
          const p = Math.min(y/120, 1);
          topbar.style.setProperty("--scroll", p.toFixed(3));
          topbar.style.background = `rgba(8,8,10,${0.72 + p*0.14})`;
          topbar.style.backdropFilter = `blur(${18 + p*4}px) saturate(1.2)`;
        }
      });
    }, {passive:true});

    document.addEventListener("keydown", e=>{
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase()==="k"){
        e.preventDefault();
        promptInput.focus();
        promptInput.select();
        composerShell.animate?.([{transform:"scale(1)"},{transform:"scale(1.012)"},{transform:"scale(1)"}],{duration:280, easing:"cubic-bezier(.16,1,.3,1)"});
      }
    });
  }

  function initMacDopamine(){
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;
    const cursorGlow = document.getElementById("cursorGlow");
    const spotlight = document.getElementById("spotlight");
    const confettiCanvas = document.getElementById("confettiCanvas");
    let hasGlow = false;

    if (cursorGlow){
      let gx=-9999, gy=-9999, tx=-9999, ty=-9999, raf=null;
      window.addEventListener("pointermove", e=>{
        tx=e.clientX; ty=e.clientY;
        if (!hasGlow){ document.body.classList.add("has-cursor-glow"); hasGlow=true; }
        if (!spotlight?.matches(":hover")){
          spotlight?.classList.remove("is-visible");
        }
        if (raf) return;
        raf=requestAnimationFrame(()=>{
          raf=null;
          gx += (tx - gx)*0.14; gy += (ty - gy)*0.14;
          cursorGlow.style.setProperty("--mx", gx+"px");
          cursorGlow.style.setProperty("--my", gy+"px");
          cursorGlow.style.transform = `translate3d(${gx}px, ${gy}px, 0)`;
          if (Math.abs(tx-gx)<0.5 && Math.abs(ty-gy)<0.5){ } else {
            raf=requestAnimationFrame(()=>{
              raf=null;
              cursorGlow.style.setProperty("--mx", tx+"px");
              cursorGlow.style.setProperty("--my", ty+"px");
              cursorGlow.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
            });
          }
        });
      }, {passive:true});
      window.addEventListener("pointerleave", ()=>{ document.body.classList.remove("has-cursor-glow"); });
      promptInput.addEventListener("focus", ()=> spotlight?.classList.add("is-visible"));
      promptInput.addEventListener("blur", ()=> spotlight?.classList.remove("is-visible"));
      let t;
      promptInput.addEventListener("input", ()=>{
        if (promptInput.value.length>0) spotlight?.classList.remove("is-visible");
        clearTimeout(t); t=setTimeout(()=>{ if(document.activeElement!==promptInput) spotlight?.classList.remove("is-visible"); }, 1600);
      });
    }

    let confettiCtx=null, confettiRunning=false, particles=[];
    function ensureCanvas(){
      if (!confettiCanvas) return null;
      confettiCanvas.width = window.innerWidth * devicePixelRatio;
      confettiCanvas.height = window.innerHeight * devicePixelRatio;
      confettiCanvas.style.width = window.innerWidth+"px";
      confettiCanvas.style.height = window.innerHeight+"px";
      confettiCtx = confettiCanvas.getContext("2d");
      confettiCtx.scale(devicePixelRatio, devicePixelRatio);
      return confettiCtx;
    }
    window.addEventListener("resize", ()=>{
      if (confettiCtx) ensureCanvas();
    });
    function burstConfetti(opts={}){
      const ctx = ensureCanvas();
      if (!ctx || !confettiCanvas) return;
      const count = opts.count||42;
      const x = opts.x ?? window.innerWidth/2;
      const y = opts.y ?? window.innerHeight*0.42;
      const colors = ["#fff","#e4e4ff","#c0c8ff","#9898ff","#ffffff"];
      for(let i=0;i<count;i++){
        const angle = (Math.PI*2 * i/count) + (Math.random()*0.6-0.3);
        const speed = 4 + Math.random()*7;
        const size = 4 + Math.random()*5;
        particles.push({
          x, y,
          vx: Math.cos(angle)*speed + (Math.random()-0.5)*2,
          vy: Math.sin(angle)*speed - Math.random()*3 - 2,
          size, rot: Math.random()*360, vr: (Math.random()-0.5)*14,
          color: colors[Math.floor(Math.random()*colors.length)],
          life: 1, decay: 0.012 + Math.random()*0.014,
          shape: Math.random()<0.5 ? "rect":"circle",
          gravity: 0.22 + Math.random()*0.14
        });
      }
      if (!confettiRunning) loop();
    }
    function loop(){
      if (!confettiCtx) return;
      confettiRunning = true;
      const w = window.innerWidth, h = window.innerHeight;
      function frame(){
        if (!confettiCtx) return;
        confettiCtx.clearRect(0,0,w,h);
        let alive=false;
        for(const p of particles){
          p.x += p.vx; p.y += p.vy; p.vy += p.gravity; p.vx *= 0.998; p.rot += p.vr; p.life -= p.decay;
          if (p.life<=0) continue;
          alive=true;
          confettiCtx.globalAlpha = Math.max(0, p.life);
          confettiCtx.fillStyle = p.color;
          confettiCtx.save();
          confettiCtx.translate(p.x, p.y);
          confettiCtx.rotate(p.rot*Math.PI/180);
          if (p.shape==="rect"){
            confettiCtx.fillRect(-p.size/2, -p.size/2, p.size, p.size*0.62);
          } else {
            confettiCtx.beginPath(); confettiCtx.arc(0,0,p.size*0.42,0,Math.PI*2); confettiCtx.fill();
          }
          confettiCtx.restore();
        }
        particles = particles.filter(p=>p.life>0);
        if (particles.length){
          requestAnimationFrame(frame);
        } else {
          confettiCtx.clearRect(0,0,w,h);
          confettiRunning=false;
        }
      }
      requestAnimationFrame(frame);
    }
    window.burstConfetti = burstConfetti;
    window._confetti = { burst: burstConfetti };

    function sparkleBurst(el, n=6){
      const r = el.getBoundingClientRect();
      for(let i=0;i<n;i++){
        const s = document.createElement("span");
        s.className = Math.random()<0.5 ? "sparkle":"sparkle sparkle--star";
        const x = (r.left + r.width*0.22 + Math.random()*r.width*0.56);
        const y = (r.top + r.height*0.18 + Math.random()*r.height*0.62);
        s.style.left = x+"px"; s.style.top = y+"px";
        s.style.position = "fixed";
        s.style.animationDelay = (i*42)+"ms";
        document.body.appendChild(s);
        setTimeout(()=> s.remove(), 760);
      }
    }
    window.sparkleBurst = sparkleBurst;

    function hapticPop(intensity=1){
      try{
        if (navigator.vibrate) navigator.vibrate(Math.round(8*intensity));
      }catch{}
      try{
        const ctx = new (window.AudioContext||window.webkitAudioContext)();
        if (!ctx) return;
        const o=ctx.createOscillator(), g=ctx.createGain();
        o.type="sine"; o.frequency.value=720 + Math.random()*120;
        g.gain.value=0.04 * intensity;
        o.connect(g); g.connect(ctx.destination);
        o.start(); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+0.12);
        setTimeout(()=>{ try{o.stop(); ctx.close()}catch{} }, 140);
      }catch{}
    }
    window._hapticPop = hapticPop;

    document.querySelectorAll(".generate-btn, .btn--primary").forEach(b=>{
      b.addEventListener("pointerenter", ()=>{
        b.animate?.([{transform:"translateY(0)"},{transform:"translateY(-1px)"}],{duration:180, easing:"cubic-bezier(.16,1,.3,1)"});
      });
    });

    const origShowToast = window.showToast;
    const toastBurst = (msg)=>{
      if (/ready|download|cleared|generated/i.test(msg)) hapticPop(0.9);
    };
    const _origShowToast = showToast;
    window.showToast = function(msg, variant){
      toastBurst(msg);
      return _origShowToast(msg, variant);
    };

    window._dopamineSuccess = (cardEl)=>{
      const rect = cardEl?.getBoundingClientRect();
      const cx = rect ? rect.left + rect.width/2 : window.innerWidth/2;
      const cy = rect ? rect.top + rect.height*0.38 : window.innerHeight/2;
      burstConfetti({x: cx, y: cy, count: 44});
      sparkleBurst(cardEl || document.body, 8);
      hapticPop(1.1);
      if (cardEl){
        cardEl.classList.add("is-success");
        cardEl.animate?.([{transform:"scale(0.99)"},{transform:"scale(1.015)"},{transform:"scale(1)"}],{duration:520, easing:"cubic-bezier(.34,1.56,.64,1)"});
        const img = cardEl.querySelector("img");
        if (img){
          img.animate?.([{filter:"brightness(1.08) saturate(1.08)"},{filter:"none"}],{duration:420, easing:"ease-out"});
        }
      }
    };

    document.querySelectorAll(".traffic-dot").forEach(d=>{
      d.addEventListener("click", ()=>{
        d.animate?.([{transform:"scale(0.92)"},{transform:"scale(1.06)"},{transform:"scale(1)"}],{duration:320, easing:"cubic-bezier(.34,1.56,.64,1)"});
        hapticPop(0.6);
      });
    });

    let lastY=window.scrollY;
    window.addEventListener("scroll", ()=>{
      const dy = window.scrollY - lastY; lastY=window.scrollY;
      if (Math.abs(dy)>2){
        document.querySelectorAll(".gen-card").forEach((c,i)=>{
          const r=c.getBoundingClientRect();
          if (r.top < window.innerHeight && r.bottom>0){
            const off = Math.max(-6, Math.min(6, -dy*0.06));
            c.style.transform = `translateY(${off}px)`;
            clearTimeout(c._t);
            c._t=setTimeout(()=> c.style.transform="", 160);
          }
        });
      }
    }, {passive:true});
  }

  function renderRatioPills() {
    ratioRow.innerHTML = "";
    RATIOS.forEach(r => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pill";
      b.textContent = r;
      b.dataset.ratio = r;
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(r === aspectRatio));
      if (r === aspectRatio) b.classList.add("is-active");
      b.addEventListener("click", () => setAspect(r));
      ratioRow.appendChild(b);
    });
  }

  function setAspect(r) {
    aspectRatio = r;
    $$(".pill[data-ratio]", ratioRow).forEach(el => {
      const on = el.dataset.ratio === r;
      el.setAttribute("aria-checked", String(on));
      el.classList.toggle("is-active", on);
    });
  }

  function setResolution(r) {
    resolution = r;
    $$(".pill[data-res]", resRow).forEach(el => {
      const on = el.dataset.res === r;
      el.setAttribute("aria-checked", String(on));
      el.classList.toggle("is-active", on);
    });
  }

  function renderKeyDots() {
    keyDots.innerHTML = "";
    for (let i = 0; i < (KEYS.length || 1); i++) {
      const d = document.createElement("span");
      d.className = "key-dot";
      d.dataset.index = i;
      keyDots.appendChild(d);
    }
    if (KEYS.length === 0) {
      const d = document.createElement("span");
      d.className = "key-dot";
      d.style.background = "rgba(255,255,255,0.08)";
      keyDots.appendChild(d);
    }
  }

  function updateKeyIndicator() {
    const now = Date.now();
    const dots = $$(".key-dot", keyDots);
    let ready = 0, cooling = 0, busy = 0;
    let minRemaining = Infinity;
    dots.forEach((dot, i) => {
      dot.classList.remove("is-ok","is-busy","is-cooldown");
      if (i >= KEYS.length) return;
      const st = keyState[i];
      const inCooldown = st.cooldownUntil > now;
      if (busyKey === i) {
        dot.classList.add("is-busy");
        busy++;
      } else if (inCooldown) {
        dot.classList.add("is-cooldown");
        cooling++;
        minRemaining = Math.min(minRemaining, Math.ceil((st.cooldownUntil - now)/1000));
      } else {
        dot.classList.add("is-ok");
        ready++;
      }
    });
    if (keyIndicator) {
      const hasCooldown = cooling > 0;
      indicatorTitle(hasCooldown, cooling, minRemaining, ready);
      keyIndicator.style.cursor = "pointer";
      keyIndicator.setAttribute("role", "button");
      keyIndicator.setAttribute("tabindex", "0");
    }
    if (KEYS.length === 0) {
      keyIndicatorText.textContent = "no keys";
      return;
    }
    if (isGenerating && busyKey !== -1) {
      keyIndicatorText.textContent = "generating…";
    } else if (cooling > 0 && ready === 0) {
      keyIndicatorText.textContent = minRemaining !== Infinity ? `cooling down · ${minRemaining}s` : "cooling down";
    } else if (cooling > 0) {
      keyIndicatorText.textContent = minRemaining !== Infinity ? `${ready} ready · ${cooling} cooling · ${minRemaining}s` : `${ready} ready · ${cooling} cooling`;
    } else {
      keyIndicatorText.textContent = `${ready} ready`;
    }
  }

  function indicatorTitle(hasCooldown, cooling, minRemaining, ready) {
    if (!keyIndicator) return;
    if (hasCooldown) {
      keyIndicator.title = `Click to reset cooldowns · ${cooling} key${cooling>1?'s':''} cooling, fastest ready in ~${minRemaining}s · Oxyy ${DISPLAY_MODEL} · 60 credits/image`;
      keyIndicator.setAttribute("aria-label", `Keys cooling, ${minRemaining} seconds remaining. Click to reset.`);
    } else {
      keyIndicator.title = `${ready} keys ready · ${DISPLAY_MODEL} · Click to reset if needed`;
      keyIndicator.setAttribute("aria-label", `${ready} keys ready`);
    }
  }

  setInterval(() => {
    if (KEYS.length && keyState.some(s => s.cooldownUntil > Date.now())) {
      updateKeyIndicator();
    }
  }, 1000);

  function bindEvents() {
    resRow.addEventListener("click", (e) => {
      const pill = e.target.closest(".pill[data-res]");
      if (!pill) return;
      setResolution(pill.dataset.res);
    });

    $("#heroSuggestions")?.addEventListener("click", (e) => {
      const b = e.target.closest(".suggestion");
      if (!b) return;
      promptInput.value = b.dataset.prompt || b.textContent;
      autoGrow(promptInput);
      promptInput.focus();
      composerShell.animate?.([
        { transform: "scale(1)" },
        { transform: "scale(1.005)" },
        { transform: "scale(1)" }
      ], { duration: 260, easing: "cubic-bezier(.16,1,.3,1)" });
    });

    composerForm.addEventListener("submit", (e) => {
      e.preventDefault();
      submitPrompt();
    });

    promptInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitPrompt();
      }
    });

    promptInput.addEventListener("input", () => {
      autoGrow(promptInput);
      if (promptInput.value.length > MAX_PROMPT) {
        promptInput.value = promptInput.value.slice(0, MAX_PROMPT);
      }
    });

    attachBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      const f = fileInput.files?.[0];
      if (f) handleFile(f);
      fileInput.value = "";
    });
    refRemove.addEventListener("click", clearReference);

    let dragCounter = 0;
    window.addEventListener("dragenter", (e) => {
      if (isFileDrag(e)) {
        dragCounter++;
        dragOverlay.classList.add("is-active");
        dragOverlay.setAttribute("aria-hidden", "false");
      }
    });
    window.addEventListener("dragleave", (e) => {
      if (isFileDrag(e)) {
        dragCounter = Math.max(0, dragCounter - 1);
        if (dragCounter === 0) hideDrag();
      }
    });
    window.addEventListener("dragover", (e) => {
      if (isFileDrag(e)) e.preventDefault();
    });
    window.addEventListener("drop", (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      hideDrag();
      dragCounter = 0;
      const f = [...(e.dataTransfer.files || [])].find(isImageFile);
      if (f) handleFile(f);
      else showToast("Please drop a PNG, JPEG or WebP image.", "error");
    });
    dragOverlay.addEventListener("click", hideDrag);
    function hideDrag(){ dragOverlay.classList.remove("is-active"); dragOverlay.setAttribute("aria-hidden","true"); }
    function isFileDrag(e){ return [...(e.dataTransfer?.types||[])].includes("Files"); }
    function isImageFile(f){ return /image\/(png|jpeg|jpg|webp)/.test(f.type); }

    window.addEventListener("paste", async (e) => {
      const items = [...(e.clipboardData?.items || [])];
      const imgItem = items.find(it => it.type.startsWith("image/"));
      if (imgItem) {
        e.preventDefault();
        const file = imgItem.getAsFile();
        if (file) handleFile(file);
      }
    });

    if (keyIndicator) {
      const handleKeyReset = () => {
        const cooling = keyState.filter(s => s.cooldownUntil > Date.now()).length;
        if (cooling === 0 && !isGenerating) {
          showToast(`Keys: ${KEYS.length} ready · ${DISPLAY_MODEL}`);
          return;
        }
        resetAllCooldowns();
        showToast(cooling ? `Reset ${cooling} cooling key${cooling>1?'s':''}. Try generating again.` : "Keys reset.");
      };
      keyIndicator.addEventListener("click", handleKeyReset);
      keyIndicator.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleKeyReset(); }
      });
    }

    historyToggle.addEventListener("click", openHistory);
    historyClose.addEventListener("click", closeHistory);
    historyBackdrop.addEventListener("click", closeHistory);
    clearHistoryBtn.addEventListener("click", () => {
      if (!history.length) return;
      if (!confirm("Clear all local history? Images stored only in this browser will be removed.")) return;
      history = [];
      persistHistory();
      renderHistory();
      showToast("History cleared.");
    });
    exportHistoryBtn.addEventListener("click", exportHistory);
    clearBtn.addEventListener("click", () => {
      if (!thread.children.length) {
        promptInput.value = "";
        clearReference();
        showToast("Workspace cleared.");
        return;
      }
      if (isGenerating) return;
      thread.innerHTML = "";
      hero.style.display = "";
      hero.animate?.([{opacity:0, transform:"translateY(8px)"},{opacity:1, transform:"none"}],{duration:320,easing:"ease-out"});
      showToast("Conversation cleared.");
    });

    lightboxBackdrop.addEventListener("click", closeLightbox);
    lightboxClose.addEventListener("click", closeLightbox);
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (lightbox.classList.contains("is-open")) closeLightbox();
        else if (historyPanel.classList.contains("is-open")) closeHistory();
        else if (dragOverlay.classList.contains("is-active")) hideDrag();
      }
    });
    lightboxDownload.addEventListener("click", () => {
      const src = lightboxImg.src;
      const name = lightboxImg.dataset.filename || "shilo-image.png";
      downloadDataUrl(src, name);
    });

    window.addEventListener("resize", () => {});
  }

  function autoGrow(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 132) + "px";
  }

  async function handleFile(file) {
    const valid = /image\/(png|jpeg|jpg|webp)/i.test(file.type);
    if (!valid) {
      showToast("Unsupported format. Use PNG, JPEG or WebP.", "error");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      showToast("Image is too large. Please use an image under 12 MB.", "error");
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const base64 = dataUrl.split(",")[1];
      const mime = file.type || "image/png";
      reference = { base64, mime, name: file.name || "reference", size: file.size, dataUrl, sizeLabel: formatBytes(file.size) };
      showReference();
      showToast("Reference added. It will be sent with your next prompt.");
    } catch {
      showToast("Could not read that image. Please try another file.", "error");
    }
  }

  function showReference() {
    if (!reference) return;
    refPreviewImg.src = reference.dataUrl;
    refPreviewName.textContent = reference.name;
    refPreviewSize.textContent = `${reference.sizeLabel} · ${reference.mime.split("/")[1].toUpperCase()}`;
    refPreview.hidden = false;
    attachBtn.classList.add("has-file");
    attachBtn.setAttribute("aria-label", "Change reference image");
  }

  function clearReference() {
    reference = null;
    refPreview.hidden = true;
    attachBtn.classList.remove("has-file");
    attachBtn.setAttribute("aria-label", "Attach reference image");
    fileInput.value = "";
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }

  function formatBytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1024*1024) return (n/1024).toFixed(1).replace(/\.0$/,"") + " KB";
    return (n/1024/1024).toFixed(1).replace(/\.0$/,"") + " MB";
  }

  async function submitPrompt() {
    if (isGenerating) return;
    const prompt = promptInput.value.trim();
    if (!prompt) {
      promptInput.focus();
      composerShell.animate?.([
        { transform:"translateX(0)" },
        { transform:"translateX(-4px)" },
        { transform:"translateX(4px)" },
        { transform:"translateX(0)" }
      ], { duration: 220, easing:"ease-out" });
      showToast("Describe what you want to create first.");
      return;
    }
    if (KEYS.length === 0) {
      showToast("The Oxyy proxy is not configured.", "error");
      return;
    }

    const aspect = aspectRatio;
    const res = resolution;
    const refForThis = reference ? { ...reference } : null;

    if (hero.style.display !== "none") {
      hero.style.display = "none";
    }

    lastPrompt = prompt;
    lastSettings = { aspect, res };
    lastReferenceForRetry = refForThis;

    const userEl = createUserMessage(prompt, refForThis);
    thread.appendChild(userEl);
    const assistantCard = createGeneratingCard(prompt, aspect, res);
    thread.appendChild(assistantCard);
    scrollToBottom();

    promptInput.value = "";
    autoGrow(promptInput);
    if (reference) clearReference();

    setGenerating(true);
    updateKeyIndicator();

    try {
      const result = await generateWithFailover(prompt, refForThis, aspect, res, assistantCard);
      if (result) {
        finalizeCardSuccess(assistantCard, result, prompt, aspect, res);
        addToHistory({ prompt, imageData: result.dataUrl, mime: result.mime, aspect, res, refThumb: refForThis?.dataUrl || null });
      }
    } catch (err) {
      if (!assistantCard.dataset.done) {
        finalizeCardError(assistantCard, err);
      }
    } finally {
      setGenerating(false);
      updateKeyIndicator();
      promptInput.focus();
    }
  }

  function createUserMessage(prompt, ref) {
    const wrap = document.createElement("div");
    wrap.className = "message";
    wrap.innerHTML = `
      <div class="msg-role msg-role--user"><span class="msg-role-dot" aria-hidden="true"></span> You</div>
      ${ref ? `<img class="msg-ref-thumb" src="${escapeAttr(ref.dataUrl)}" alt="Reference image for: ${escapeAttr(prompt.slice(0,80))}" loading="lazy" />` : ``}
      <p class="msg-prompt">${escapeHtml(prompt)}</p>
      <div class="msg-meta">
        <span class="meta-pill">${escapeHtml(aspectRatio)} · ${escapeHtml(resolution)}</span>
        ${ref ? `<span class="meta-pill">Reference · ${escapeHtml(ref.mime.split("/")[1])}</span>` : ``}
        <span class="meta-pill">${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
      </div>
    `;
    return wrap;
  }

  function createGeneratingCard(prompt, aspect, res) {
    const el = document.createElement("div");
    el.className = "message";
    el.innerHTML = `
      <div class="msg-role msg-role--assistant"><span class="msg-role-dot" aria-hidden="true"></span> Shilo Studio · ${escapeHtml(DISPLAY_MODEL)}</div>
      <div class="gen-card" data-state="loading">
        <div class="gen-card-media" aria-busy="true" aria-label="Generating image">
          <div class="gen-card-shimmer" aria-hidden="true"></div>
          <div class="gen-loader">
            <div class="gen-loader-dots" aria-hidden="true"><span></span><span></span><span></span></div>
            <div class="gen-loader-text">Composing with ${escapeHtml(DISPLAY_MODEL)}…</div>
            <div class="gen-loader-sub">${escapeHtml(prompt.slice(0,72))}${prompt.length>72?"…":""} · ${escapeHtml(aspect)} · ${escapeHtml(res)} · 60 credits</div>
          </div>
          <div class="gen-progress" aria-hidden="true"><div class="gen-progress-bar"></div></div>
        </div>
        <div class="gen-card-footer">
          <div class="gen-card-info">
            <span class="gen-card-title">Generating</span>
            <span class="gen-card-sub">${escapeHtml(aspect)} · ${escapeHtml(res)} · ${escapeHtml(DISPLAY_MODEL)} · Oxyy</span>
          </div>
          <div class="gen-card-actions">
            <button class="btn btn--subtle" type="button" disabled aria-label="Generating">Working…</button>
          </div>
        </div>
      </div>
    `;
    return el;
  }

  function finalizeCardSuccess(card, result, prompt, aspect, res) {
    const genCard = card.querySelector(".gen-card");
    if (!genCard) return;
    card.dataset.done = "success";
    const safePrompt = escapeAttr(prompt.slice(0,140));
    genCard.dataset.state = "done";
    genCard.innerHTML = `
      <div class="gen-card-media">
        <img src="${escapeAttr(result.dataUrl)}" alt="${safePrompt}" loading="lazy" />
        <div class="gen-card-shimmer" aria-hidden="true" style="display:none"></div>
      </div>
      <div class="gen-card-footer">
        <div class="gen-card-info">
          <span class="gen-card-title" title="${safePrompt}">${escapeHtml(prompt.slice(0,56))}${prompt.length>56?"…":""}</span>
          <span class="gen-card-sub">${escapeHtml(aspect)} · ${escapeHtml(res)} · ${escapeHtml(result.mime.split("/")[1]||"PNG")} · ${escapeHtml(DISPLAY_MODEL)} · ${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
        </div>
        <div class="gen-card-actions">
          <button class="btn btn--ghost" type="button" data-action="retry" aria-label="Retry generation">Retry</button>
          <button class="btn btn--primary" type="button" data-action="download" aria-label="Download image">Download</button>
        </div>
      </div>
    `;
    const img = genCard.querySelector("img");
    requestAnimationFrame(() => {
      img.addEventListener("load", () => img.classList.add("is-loaded"), { once:true });
      if (img.complete) img.classList.add("is-loaded");
      else setTimeout(()=> img.classList.add("is-loaded"), 80);
    });
    img.style.cursor = "zoom-in";
    img.addEventListener("click", () => openLightbox(result.dataUrl, prompt));

    genCard.querySelector('[data-action="download"]').addEventListener("click", () => {
      const filename = `shilo-${Date.now()}-${aspect.replace(":","x")}.png`;
      downloadDataUrl(result.dataUrl, filename);
    });
    genCard.querySelector('[data-action="retry"]').addEventListener("click", () => {
      if (lastPrompt) {
        promptInput.value = lastPrompt;
        if (lastSettings) { setAspect(lastSettings.aspect); setResolution(lastSettings.res); }
        if (lastReferenceForRetry) { reference = { ...lastReferenceForRetry }; showReference(); }
        autoGrow(promptInput);
        submitPrompt();
      }
    });
    scrollToBottom();
    requestAnimationFrame(()=> {
      setTimeout(()=>{
        try{ window._dopamineSuccess?.(genCard); }catch{}
        try{ window._hapticPop?.(1); }catch{}
      }, 90);
    });
  }

  function finalizeCardError(card, err) {
    const genCard = card.querySelector(".gen-card");
    card.dataset.done = "error";
    const title = err.title || "Generation failed";
    const desc = err.message || "Something went wrong. Please try again.";
    const rawForToggle = err.rawMessage || err.message || "";
    const isQuotaZero = !!err.isQuotaZero;
    const isAllFailed = err.allFailed;
    if (genCard) genCard.remove();
    const errEl = document.createElement("div");
    errEl.className = "error-card";
    errEl.setAttribute("role", "alert");
    const helpLink = err.helpUrl ? `<a href="${escapeAttr(err.helpUrl)}" target="_blank" rel="noopener" style="color:inherit; text-decoration:underline; text-underline-offset:2px">View details →</a>` : "";
    const detailBlock = rawForToggle && rawForToggle !== desc
      ? `<details style="margin-top:10px; opacity:.9"><summary style="cursor:pointer; font-size:12px; color:rgba(252,165,165,0.9)">Show API details</summary><pre style="margin:8px 0 0; padding:8px 10px; border-radius:8px; background:rgba(0,0,0,0.22); border:1px solid rgba(239,68,68,0.14); white-space:pre-wrap; word-break:break-word; font-family:JetBrains Mono, monospace; font-size:11px; line-height:1.5; max-height:160px; overflow:auto">${escapeHtml(truncate(rawForToggle, 900))}</pre></details>`
      : "";
    errEl.innerHTML = `
      <div class="error-icon" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 8v6"/><path d="M12 16h.01"/><path d="M10.3 3.3 3 20a1 1 0 0 0 .9 1.4h16.2a1 1 0 0 0 .9-1.4L13.7 3.3a1 1 0 0 0-1.7 0z"/></svg>
      </div>
      <div style="flex:1; min-width:0">
        <p class="error-title">${escapeHtml(title)}</p>
        <p class="error-desc">${escapeHtml(desc)} ${helpLink}</p>
        ${isQuotaZero ? `<p class="error-desc" style="margin-top:8px; opacity:.9; background:rgba(239,68,68,0.10); padding:8px 10px; border-radius:9px; border:1px solid rgba(239,68,68,0.14)">Oxyy reports insufficient credits or quota for <code style="background:rgba(0,0,0,0.2); padding:1px 5px; border-radius:4px">${escapeHtml(MODEL)}</code> (60 credits/image). Check your Oxyy balance at https://api.oxyy.ai</p>` : ``}
        <div class="error-actions">
          <button class="btn btn--primary" type="button" data-action="retry-error">Retry</button>
          <button class="btn btn--subtle" type="button" data-action="reset-keys">Reset keys</button>
          <button class="btn btn--ghost" type="button" data-action="dismiss">Dismiss</button>
        </div>
        ${isAllFailed && !isQuotaZero ? `<p class="error-desc" style="margin-top:8px; opacity:.85">The Oxyy proxy could not complete the request. Check its server configuration or try again.</p>` : ``}
        ${detailBlock}
        ${err.retryDelay ? `<p class="error-desc" style="margin-top:6px; font-variant-numeric:tabular-nums; opacity:.75">Retry after ${escapeHtml(err.retryDelay)} · Keys cooling for ~${parseInt(err.retryDelay)||45}s</p>` : ``}
      </div>
    `;
    card.appendChild(errEl);
    errEl.querySelector('[data-action="retry-error"]').addEventListener("click", () => {
      if (lastPrompt) {
        card.remove();
        promptInput.value = lastPrompt;
        if (lastSettings) { setAspect(lastSettings.aspect); setResolution(lastSettings.res); }
        if (lastReferenceForRetry) { reference = {...lastReferenceForRetry}; showReference(); }
        autoGrow(promptInput);
        submitPrompt();
      }
    });
    errEl.querySelector('[data-action="reset-keys"]').addEventListener("click", () => {
      resetAllCooldowns();
      showToast("Key cooldowns reset. Retrying…");
      setTimeout(() => {
        card.remove();
        if (lastPrompt) {
          promptInput.value = lastPrompt;
          if (lastSettings) { setAspect(lastSettings.aspect); setResolution(lastSettings.res); }
          if (lastReferenceForRetry) { reference = {...lastReferenceForRetry}; showReference(); }
          autoGrow(promptInput);
          submitPrompt();
        }
      }, 180);
    });
    errEl.querySelector('[data-action="dismiss"]').addEventListener("click", () => card.remove());
    scrollToBottom();
  }

  function resetAllCooldowns() {
    keyState.forEach(s => { s.cooldownUntil = 0; s.failures = Math.max(0, s.failures - 1); });
    updateKeyIndicator();
    keyIndicatorText.animate?.([{opacity:0.6},{opacity:1}],{duration:220,easing:"ease-out"});
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smoothScroll() ? "smooth" : "instant" });
      const last = thread.lastElementChild;
      last?.scrollIntoView({ behavior: smoothScroll() ? "smooth" : "instant", block: "end" });
    });
  }
  function smoothScroll(){ return !window.matchMedia("(prefers-reduced-motion: reduce)").matches; }

  function setGenerating(v) {
    isGenerating = v;
    generateBtn.disabled = v;
    promptInput.disabled = v;
    attachBtn.disabled = v;
    generateBtn.classList.toggle("is-loading", v);
    if (v) {
      generateBtn.querySelector(".generate-btn-label").textContent = "Generating…";
    } else {
      generateBtn.querySelector(".generate-btn-label").textContent = "Generate";
    }
    $$(".pill", composerForm).forEach(b => b.disabled = v);
  }

  // ——— Oxyy + Failover ———
  async function generateWithFailover(prompt, ref, aspect, res, card) {
    const ordered = getOrderedKeyIndices();
    let lastError = null;
    let transientCount = 0;

    for (let attempt = 0; attempt < ordered.length; attempt++) {
      const keyIdx = ordered[attempt];
      busyKey = keyIdx;
      updateKeyIndicator();
      const sub = card.querySelector(".gen-loader-sub");
      if (attempt > 0 && sub) {
        sub.textContent = `Trying another Oxyy key… (${attempt+1}/${ordered.length})`;
        sub.animate?.([{opacity:0, transform:"translateY(4px)"},{opacity:1, transform:"none"}],{duration:220,easing:"ease-out"});
      }
      if (attempt > 0) {
        showToast("Trying another Oxyy key…");
      }

      try {
        const result = await callOxyy(prompt, ref, aspect, res, KEYS[keyIdx]);
        keyState[keyIdx].lastSuccess = Date.now();
        keyState[keyIdx].failures = 0;
        keyState[keyIdx].cooldownUntil = 0;
        lastSuccessfulKey = keyIdx;
        busyKey = -1;
        updateKeyIndicator();
        showToast("Image ready — 60 credits used.");
        return result;
      } catch (e) {
        lastError = e;
        const status = e.status || 0;
        const isTransient = isTransientError(status, e.code);
        const isAuth = status === 401 || status === 403;
        const isBadRequest = status === 400;

        keyState[keyIdx].lastFailure = Date.now();
        keyState[keyIdx].failures++;
        let cd = null;
        if (e.retryDelay) {
          const m = String(e.retryDelay).match(/(\d+)/);
          if (m) cd = (parseInt(m[1],10) * 1000) + 800;
        }
        if (isTransient) {
          transientCount++;
          const base = cd ?? COOLDOWN[status] ?? (e.code === "network" ? COOLDOWN.network : COOLDOWN.generic);
          keyState[keyIdx].cooldownUntil = Date.now() + base;
        } else if (isAuth || isBadRequest) {
          keyState[keyIdx].cooldownUntil = Date.now() + (cd ?? 30_000);
        } else {
          keyState[keyIdx].cooldownUntil = Date.now() + (cd ?? 12_000);
        }

        busyKey = -1;
        updateKeyIndicator();

        const isLast = attempt === ordered.length - 1;
        if (isBadRequest && !isTransient && attempt >= 1) {
          break;
        }
        if (isLast) break;

        if (isTransient || isAuth) {
          await sleep(420 + Math.random()*300);
        } else if (isBadRequest) {
          await sleep(280);
        } else {
          await sleep(350);
        }
      }
    }

    busyKey = -1;
    updateKeyIndicator();
    const final = normalizeFinalError(lastError, transientCount, ordered.length);
    finalizeCardError(card, final);
    throw final;
  }

  function getOrderedKeyIndices() {
    const now = Date.now();
    const indices = KEYS.map((_, i) => i);
    if (lastSuccessfulKey !== -1 && indices.includes(lastSuccessfulKey)) {
      const st = keyState[lastSuccessfulKey];
      if (st.cooldownUntil <= now) {
        indices.splice(indices.indexOf(lastSuccessfulKey), 1);
        indices.unshift(lastSuccessfulKey);
      }
    }
    indices.sort((a,b) => {
      const ca = keyState[a].cooldownUntil - now;
      const cb = keyState[b].cooldownUntil - now;
      const aReady = ca <= 0;
      const bReady = cb <= 0;
      if (aReady !== bReady) return aReady ? -1 : 1;
      if (ca !== cb) return ca - cb;
      return keyState[a].failures - keyState[b].failures;
    });
    return indices;
  }

  function isTransientError(status, code) {
    if (code === "network") return true;
    if (status === 429 || status === 500 || status === 503) return true;
    return false;
  }

  function normalizeFinalError(lastError, transientCount, totalKeys) {
    const status = lastError?.status || 0;
    const code = lastError?.code || "";
    const rawMsg = lastError?.message || lastError?.rawMessage || "";

    if (KEYS.length === 0) {
      return { title: "Proxy not configured", message: "Configure OXY_API_KEY in the Pages Function to start generating.", allFailed: true, status, rawMessage: rawMsg };
    }
    if (code === "network") {
      return { title: "Couldn't reach Oxyy", message: "Check your connection and try again.", allFailed: totalKeys>1, status, rawMessage: rawMsg };
    }
    if (status === 429) {
      const msg = rawMsg || "";
      const isQuotaZero = /insufficient.*credit/i.test(msg) || /quota/i.test(msg) || /balance/i.test(msg) || /limit:\s*0/i.test(msg);
      const retryDelay = lastError?.retryDelay || "";
      if (isQuotaZero || /credit/i.test(msg)) {
        return {
          title: "Oxyy credits exhausted",
          message: `Oxyy reports insufficient credits for ${DISPLAY_MODEL} (60 credits/image). Top up at https://api.oxyy.ai`,
          detail: msg ? truncate(msg, 420) : "",
          rawMessage: msg,
          allFailed: true,
          status,
          isQuotaZero: true,
          helpUrl: "https://api.oxyy.ai"
        };
      }
      const wait = retryDelay ? ` Retry after ${retryDelay}.` : " Please wait ~60s and try again.";
      return {
        title: "Generation unavailable",
        message: `All Oxyy keys are rate-limited.${wait}`,
        detail: msg ? truncate(msg, 280) : "",
        rawMessage: msg,
        allFailed: true,
        status,
        retryDelay
      };
    }
    if (status === 401 || status === 403) {
      return { title: "Authentication failed", message: "Oxyy rejected the server-side credential. Check OXY_API_KEY in the Pages project settings.", allFailed: true, status, rawMessage: rawMsg };
    }
    if (status === 400) {
      const msg = rawMsg || "";
      if (/API key/i.test(msg)) {
        return { title: "Request error", message: "The request was rejected. Verify your prompt and API key configuration.", detail: truncate(msg, 260), allFailed: false, status, rawMessage: msg };
      }
      return { title: "Request error", message: msg ? truncate(msg, 240) : "The request was not accepted. Try rephrasing your prompt.", allFailed: false, status, rawMessage: msg };
    }
    if (status === 500 || status === 503) {
      return { title: "Oxyy is temporarily unavailable", message: "Oxyy is temporarily unavailable. Please try again in a moment.", allFailed: true, status, rawMessage: rawMsg };
    }
    if (lastError?.title) return lastError;
    return { title: "Generation unavailable", message: lastError?.message || "All Oxyy keys were tried without success. Please try again.", detail: rawMsg ? truncate(rawMsg, 260) : "", allFailed: true, status, rawMessage: rawMsg };
  }

  // ——— Oxyy OpenAI-compatible ———
  function getOxyySize(aspect, res) {
    const baseMap = { "1K": 1024, "2K": 2048, "4K": 4096 };
    const base = baseMap[res] || 1024;
    const [wR, hR] = aspect.split(":").map(Number);
    if (!wR || !hR) return "1024x1024";
    // keep longest side = base, preserve ratio, round to multiple of 64 for model friendliness
    let w, h;
    if (wR >= hR) {
      w = base;
      h = Math.round((base * hR / wR) / 64) * 64;
      if (h < 64) h = 64;
    } else {
      h = base;
      w = Math.round((base * wR / hR) / 64) * 64;
      if (w < 64) w = 64;
    }
    // Clamp to reasonable limits (Oxyy may cap at 2048/4096)
    return `${w}x${h}`;
  }

  async function callOxyy(prompt, ref, aspect, res, apiKey) {
    const url = `${BASE_URL}/images/generations`;
    const size = getOxyySize(aspect, res);

    // Build OpenAI-compatible body
    const body = {
      model: MODEL,
      prompt: prompt,
      n: 1,
      size: size,
      response_format: "b64_json"
    };

    // Attach reference image where supported — try multiple field names for max compat
    // Oxyy nano-banana-2 supports image-to-image; we send as data URL
    if (ref && ref.base64) {
      const dataUrl = ref.dataUrl || `data:${ref.mime || "image/png"};base64,${ref.base64}`;
      // Primary fields for Oxyy / OpenAI-compatible proxies
      body.image = dataUrl;
      // Also provide alternative fields some proxies expect
      body.reference_image = dataUrl;
      body.input_image = dataUrl;
      body.images = [dataUrl];
      // Hint to model that this is an edit
      // Keep prompt as-is; Oxyy will use image as reference
    }

    // Also send aspect/res hints as extra fields for proxies that respect them
    body.aspect_ratio = aspect;
    body.resolution = res;

    let resp;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body)
      });
    } catch (e) {
      throw { status: 0, code: "network", message: "Couldn't reach Oxyy. Check your connection and try again.", title: "Couldn't reach Oxyy", rawMessage: String(e) };
    }

    if (!resp.ok) {
      let data = null;
      let text = "";
      try { text = await resp.text(); data = text ? JSON.parse(text) : null; } catch {}
      const rawMsg = data?.error?.message || data?.error?.msg || data?.message || text || `Request failed (${resp.status})`;
      let retryDelay = "";
      try {
        const details = data?.error?.details || data?.details || [];
        for (const d of details) {
          if (d["@type"]?.includes("RetryInfo") && d.retryDelay) retryDelay = d.retryDelay;
          if (d.retryDelay) retryDelay = d.retryDelay;
        }
        if (!retryDelay && (data?.error?.retryDelay || data?.retryDelay)) retryDelay = data.error.retryDelay || data.retryDelay;
        // OpenAI-style Retry-After header
        if (!retryDelay) {
          const ra = resp.headers.get("retry-after") || resp.headers.get("Retry-After");
          if (ra) retryDelay = ra + "s";
        }
      } catch {}
      const sanitized = sanitizeApiMessage(rawMsg);
      // mask key in error if leaked
      throw { status: resp.status, message: sanitized, rawMessage: rawMsg, title: titleForStatus(resp.status), code: String(resp.status), raw: data, retryDelay };
    }

    let data;
    try {
      data = await resp.json();
    } catch {
      throw { status: 502, message: "Received a malformed response from Oxyy. Please try again.", title: "Unexpected response" };
    }

    const found = extractOxyyImage(data);
    if (!found) {
      const txt = data?.data?.[0]?.revised_prompt || data?.output_text || extractOxyyText(data);
      if (txt) {
        throw { status: 502, message: truncate(txt, 220), title: "No image returned", raw: data };
      }
      throw { status: 502, message: "No image was returned. Try rephrasing your prompt or check Oxyy credits.", title: "No image returned", raw: data };
    }

    let mime = found.mimeType || "image/png";
    let b64 = found.data;
    let dataUrl;

    // If we got a URL instead of b64, fetch it or use directly
    if (found.isUrl) {
      // Try to keep as URL for display; for history we want base64, so fetch if possible
      // Use URL directly to avoid extra fetch; download will fetch
      dataUrl = b64; // b64 actually is URL in this path
      // Try to detect mime from URL
      if (dataUrl.includes(".webp")) mime = "image/webp";
      else if (dataUrl.includes(".jpg") || dataUrl.includes(".jpeg")) mime = "image/jpeg";
      // For unified handling, if it's a URL we keep it; finalize will use it as src
      // But for persistence we need base64 — attempt to fetch quietly (best-effort)
      try {
        // Don't block on fetch failure; keep URL
        const fetched = await fetch(dataUrl);
        if (fetched.ok) {
          const blob = await fetched.blob();
          const fetchedB64 = await blobToBase64(blob);
          if (fetchedB64) {
            const rawB64 = fetchedB64.split(",")[1];
            if (rawB64 && rawB64.length > 100) {
              b64 = rawB64;
              mime = blob.type || mime;
              dataUrl = `data:${mime};base64,${b64}`;
            }
          }
        }
      } catch {}
      // If fetch failed, keep URL as dataUrl
      if (!dataUrl.startsWith("data:")) {
        return { dataUrl, mime, base64: b64, text: extractOxyyText(data) || "", raw: data, isUrl: true };
      }
    } else {
      b64 = b64.replace(/\s+/g, "");
      if (!b64 || b64.length < 100) {
        throw { status: 502, message: "Received incomplete image data. Please try again.", title: "Incomplete image" };
      }
      dataUrl = `data:${mime};base64,${b64}`;
    }

    const text = extractOxyyText(data) || "";
    return { dataUrl, mime, base64: b64, text, raw: data };
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  function sanitizeApiMessage(msg) {
    if (!msg) return "Request failed. Please try again.";
    let s = String(msg);
    s = s.replace(/oxyy-[0-9a-zA-Z]{20,}/g, "[key]");
    s = s.replace(/AIza[0-9A-Za-z\-_]{10,}/g, "[key]");
    s = s.replace(/AQ\.Ab8RN[^\s"']*/g, "[key]");
    const isQuota = /quota|credit|balance/i.test(s);
    const limit = isQuota ? 520 : 300;
    if (s.length > limit) s = s.slice(0,limit) + "…";
    return s;
  }

  function titleForStatus(s) {
    if (s === 429) return "Rate limited";
    if (s === 401 || s === 403) return "Authentication failed";
    if (s === 400) return "Request error";
    if (s === 500 || s === 503) return "Oxyy unavailable";
    return "Generation failed";
  }

  function truncate(s, n){ return s.length>n ? s.slice(0,n)+"…" : s; }

  // Oxyy response parsers — OpenAI compatible
  function extractOxyyImage(data) {
    try {
      // Standard OpenAI: { data: [{ b64_json: "...", url: "..." }] }
      if (Array.isArray(data?.data) && data.data.length) {
        const first = data.data[0];
        if (first?.b64_json && typeof first.b64_json === "string" && first.b64_json.length > 100) {
          return { data: first.b64_json, mimeType: "image/png", isUrl: false };
        }
        if (first?.b64Json && typeof first.b64Json === "string" && first.b64Json.length > 100) {
          return { data: first.b64Json, mimeType: "image/png", isUrl: false };
        }
        if (first?.base64 && typeof first.base64 === "string" && first.base64.length > 100) {
          return { data: first.base64, mimeType: first.mime_type || first.mimeType || "image/png", isUrl: false };
        }
        if (first?.url && typeof first.url === "string" && first.url.startsWith("http")) {
          return { data: first.url, mimeType: "image/png", isUrl: true };
        }
        if (first?.image_url?.url) {
          return { data: first.image_url.url, mimeType: "image/png", isUrl: true };
        }
      }
      // Alternative: { images: [...] }, { output: [...] }
      if (Array.isArray(data?.images) && data.images.length) {
        const first = data.images[0];
        if (typeof first === "string" && first.length > 100) {
          if (first.startsWith("http")) return { data: first, mimeType: "image/png", isUrl: true };
          return { data: first, mimeType: "image/png", isUrl: false };
        }
        if (first?.b64_json) return { data: first.b64_json, mimeType: "image/png", isUrl: false };
        if (first?.url) return { data: first.url, mimeType: "image/png", isUrl: true };
      }
      if (Array.isArray(data?.output) && data.output.length) {
        for (const o of data.output) {
          if (o?.b64_json) return { data: o.b64_json, mimeType: "image/png", isUrl: false };
          if (o?.url) return { data: o.url, mimeType: "image/png", isUrl: true };
        }
      }
      // Flat fields
      if (typeof data?.b64_json === "string" && data.b64_json.length > 100) {
        return { data: data.b64_json, mimeType: "image/png", isUrl: false };
      }
      if (typeof data?.image === "string" && data.image.length > 100) {
        if (data.image.startsWith("http")) return { data: data.image, mimeType: "image/png", isUrl: true };
        return { data: data.image, mimeType: "image/png", isUrl: false };
      }
      // Deep scan fallback for any large base64
      const deep = deepFindOxyyBase64(data);
      if (deep) return deep;
    } catch {}
    return null;
  }

  function deepFindOxyyBase64(obj, seen = new Set()) {
    if (!obj || typeof obj !== "object" || seen.has(obj)) return null;
    seen.add(obj);
    // Look for common keys
    const keys = ["b64_json", "b64Json", "base64", "image_base64", "data"];
    for (const k of keys) {
      if (typeof obj[k] === "string" && obj[k].length > 200 && /^[A-Za-z0-9+/=]+$/.test(obj[k].slice(0,200))) {
        return { data: obj[k], mimeType: obj.mime_type || obj.mimeType || "image/png", isUrl: false };
      }
    }
    if (typeof obj.url === "string" && obj.url.startsWith("http") && obj.url.length < 2048 && (obj.url.includes("image") || obj.url.includes("oxyy") || obj.url.includes("blob"))) {
      // Only return URL if it looks like an image URL and no b64 found elsewhere at this level
    }
    for (const v of Object.values(obj)) {
      if (v && typeof v === "object") {
        const r = deepFindOxyyBase64(v, seen);
        if (r) return r;
      }
    }
    return null;
  }

  function extractOxyyText(data) {
    try {
      if (typeof data?.data?.[0]?.revised_prompt === "string" && data.data[0].revised_prompt.trim()) return data.data[0].revised_prompt.trim();
      if (Array.isArray(data?.output_text) && data.output_text.length) return data.output_text.join("\n");
      if (typeof data?.output_text === "string") return data.output_text;
      // Fallback if Oxyy proxies upstream
      const candidates = data?.candidates;
      if (Array.isArray(candidates)) {
        const parts = candidates[0]?.content?.parts || [];
        for (const p of parts) if (typeof p.text === "string" && p.text.trim()) return p.text.trim();
      }
    } catch {}
    return "";
  }

  // ——— History ———
  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) history = parsed;
      }
    } catch {
      history = [];
    }
  }

  function persistHistory() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      return true;
    } catch (e) {
      if (isQuotaExceeded(e)) {
        return handleQuotaExceeded();
      }
      showToast("Could not save history locally.", "error");
      return false;
    }
  }

  function isQuotaExceeded(e){
    return e && (e.name === "QuotaExceededError" || e.code === 22 || String(e.message||"").toLowerCase().includes("quota"));
  }

  function handleQuotaExceeded() {
    let attempts = 0;
    let cloned = [...history];
    while (attempts < 6) {
      attempts++;
      let stripped = false;
      for (let i = cloned.length - 1; i >= 0; i--) {
        if (cloned[i].refThumb) { cloned[i] = { ...cloned[i], refThumb: null }; stripped = true; break; }
      }
      if (!stripped) {
        cloned.pop();
        if (!cloned.length) break;
      }
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(cloned));
        history = cloned;
        showToast("Storage full — trimmed older history to save your latest image.");
        renderHistory();
        return true;
      } catch (e2) {
        if (!isQuotaExceeded(e2)) break;
      }
    }
    try {
      const trimmed = history.slice(0, 6);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
      history = trimmed;
      showToast("Storage limit reached. Kept recent images only.");
      renderHistory();
      return true;
    } catch {}
    showToast("Local storage is full — history not saved, but your image is still ready to download.", "error");
    return false;
  }

  function addToHistory(entry) {
    const item = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2,6),
      prompt: entry.prompt,
      imageData: entry.imageData,
      mime: entry.mime,
      aspect: entry.aspect,
      resolution: entry.resolution,
      timestamp: new Date().toISOString(),
      refThumb: entry.refThumb || null
    };
    history.unshift(item);
    if (history.length > 48) history = history.slice(0,48);
    const ok = persistHistory();
    if (ok) renderHistory();
  }

  function renderHistory() {
    historyGrid.innerHTML = "";
    historyCount.hidden = history.length === 0;
    historyCount.textContent = String(history.length);
    historySubtitle.textContent = history.length ? `${history.length} saved · local only` : "Local only";
    if (!history.length) {
      historyEmpty.hidden = false;
      historyEmpty.style.display = "";
      return;
    }
    historyEmpty.hidden = true;
    historyEmpty.style.display = "none";
    history.forEach((item, idx) => {
      const el = document.createElement("div");
      el.className = "history-item";
      el.setAttribute("role", "listitem");
      el.tabIndex = 0;
      el.setAttribute("aria-label", `Generated image: ${item.prompt.slice(0,60)}`);
      el.innerHTML = `
        <img src="${escapeAttr(item.imageData)}" alt="${escapeAttr(item.prompt.slice(0,80))}" loading="lazy" />
        <div class="history-item-meta">
          <span class="history-item-prompt">${escapeHtml(item.prompt.slice(0,38))}${item.prompt.length>38?"…":""}</span>
          <span class="history-item-time">${escapeHtml(formatTime(item.timestamp))} · ${escapeHtml(item.aspect)} · ${escapeHtml(item.resolution)}</span>
        </div>
      `;
      el.addEventListener("click", () => openLightbox(item.imageData, item.prompt));
      el.addEventListener("keydown", (e) => { if (e.key==="Enter"||e.key===" ") { e.preventDefault(); openLightbox(item.imageData, item.prompt); }});
      el.style.animationDelay = `${Math.min(idx*28, 220)}ms`;
      historyGrid.appendChild(el);
    });
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches && history.length){
      historyCount.animate?.([{transform:"scale(1)"},{transform:"scale(1.18)"},{transform:"scale(1)"}],{duration:340, easing:"cubic-bezier(.34,1.56,.64,1)"});
      historyGrid.animate?.([{opacity:0.96},{opacity:1}],{duration:220, easing:"ease-out"});
    }
  }

  function formatTime(iso){
    try {
      const d = new Date(iso);
      const now = new Date();
      const diff = now - d;
      if (diff < 60_000) return "just now";
      if (diff < 3600_000) return `${Math.floor(diff/60000)}m ago`;
      if (diff < 86400_000) return `${Math.floor(diff/3600000)}h ago`;
      return d.toLocaleDateString([], { month:"short", day:"numeric" }) + " · " + d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    } catch { return ""; }
  }

  function exportHistory(){
    if (!history.length) { showToast("No history to export."); return; }
    const blob = new Blob([JSON.stringify(history.map(h => ({
      prompt: h.prompt, aspect: h.aspect, resolution: h.resolution, timestamp: h.timestamp
    })), null, 2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `shilo-history-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=> URL.revokeObjectURL(url), 1000);
    showToast("History metadata exported.");
  }

  function openHistory(){
    historyPanel.classList.add("is-open");
    historyPanel.removeAttribute("inert");
    historyPanel.setAttribute("aria-hidden","false");
    historyBackdrop.hidden = false;
    historyToggle.setAttribute("aria-expanded","true");
    historyToggle.setAttribute("aria-label","Close history");
    document.body.style.overflow = "hidden";
  }
  function closeHistory(){
    historyPanel.classList.remove("is-open");
    historyPanel.setAttribute("aria-hidden","true");
    historyPanel.setAttribute("inert","");
    historyBackdrop.hidden = true;
    historyToggle.setAttribute("aria-expanded","false");
    historyToggle.setAttribute("aria-label","Open history");
    document.body.style.overflow = "";
  }

  function openLightbox(src, caption){
    lightboxImg.src = src;
    lightboxImg.alt = caption ? `Generated image: ${caption.slice(0,120)}` : "Generated image";
    lightboxImg.dataset.filename = `shilo-${Date.now()}.png`;
    lightboxCaption.textContent = caption || "";
    lightbox.classList.add("is-open");
    lightbox.setAttribute("aria-hidden","false");
    document.body.style.overflow = "hidden";
    lightboxClose.focus();
  }
  function closeLightbox(){
    lightbox.classList.remove("is-open");
    lightbox.setAttribute("aria-hidden","true");
    document.body.style.overflow = historyPanel.classList.contains("is-open") ? "hidden" : "";
    setTimeout(()=> { if(!lightbox.classList.contains("is-open")) lightboxImg.removeAttribute("src"); }, 300);
  }

  function downloadDataUrl(dataUrl, filename){
    try {
      // If it's a remote URL (Oxyy sometimes returns URL), fetch as blob
      if (dataUrl.startsWith("http")) {
        fetch(dataUrl).then(r => r.blob()).then(blob => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename || `shilo-image-${Date.now()}.png`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(()=> URL.revokeObjectURL(url), 1000);
          showToast("Download started.");
        }).catch(() => window.open(dataUrl, "_blank"));
        return;
      }
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = filename || `shilo-image-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast("Download started.");
    } catch {
      window.open(dataUrl, "_blank");
    }
  }

  function showToast(msg, variant="info"){
    const el = document.createElement("div");
    el.className = `toast ${variant==="error"?"toast--error":""}`;
    el.setAttribute("role", "status");
    el.innerHTML = `<span class="toast-dot" aria-hidden="true"></span><span>${escapeHtml(msg)}</span>`;
    toastRegion.appendChild(el);
    setTimeout(()=> {
      const anim = el.animate?.([{opacity:1, transform:"none"},{opacity:0, transform:"translateY(6px)"}],{duration:220, easing:"ease-out"});
      if (anim) anim.onfinish = () => el.remove();
      setTimeout(()=> el.remove(), 260);
    }, 2800);
  }

  function escapeHtml(s){
    return String(s)
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&quot;")
      .replace(/"/g,"&quot;");
  }
  function escapeAttr(s){ return escapeHtml(s).replace(/'/g,"&#39;"); }

  function sleep(ms){ return new Promise(r=> setTimeout(r, ms)); }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.ShiloWorkspace = {
    getHistory: () => [...history],
    clearHistory: () => { history=[]; persistHistory(); renderHistory(); },
    getSettings: () => ({ aspectRatio, resolution, model: MODEL, displayModel: DISPLAY_MODEL, baseUrl: BASE_URL, keysConfigured: KEYS.length })
  };
})();
