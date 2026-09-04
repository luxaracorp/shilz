(() => {
  "use strict";

  // ——— Config — Oxyy ———
  const BASE_URL = "/api";
  const IMAGE_MODEL = (window.OXY_MODEL || window.GEMINI_MODEL || "nano-banana-2").trim();
  const MODEL = IMAGE_MODEL;
  const DISPLAY_MODEL = "Nano Banana Pro";
  const DISPLAY_VIDEO_MODEL = "Veo / Grok Imagine";
  const KEYS = ["proxy"];

  const VIDEO_MODELS = [
    { id: "veo-3.1", label: "Veo 3", badge: "Google", audio: true },
    { id: "veo-3.1-fast", label: "Veo 3.1 Fast", badge: "Fast", audio: true },
    { id: "grok-imagine-video", label: "Grok Imagine", badge: "xAI", audio: true }
  ];
  const IMAGE_RESOLUTIONS = ["1K","2K","4K"];
  const VIDEO_RESOLUTIONS = ["720p","1080p"];
  const VIDEO_DURATIONS = ["4","6","8"];
  const RATIOS = ["1:1","16:9","9:16","4:3","3:4","3:2","2:3","21:9"];

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
  const lightboxVideo = $("#lightboxVideo");
  const lightboxCaption = $("#lightboxCaption");
  const lightboxBackdrop = $("#lightboxBackdrop");
  const lightboxClose = $("#lightboxClose");
  const lightboxDownload = $("#lightboxDownload");

  const modeSwitch = $("#modeSwitch");
  const modeHint = $("#modeHint");
  const imageModelRow = $("#imageModelRow");
  const videoModelRow = $("#videoModelRow");
  const videoModelGroup = $("#videoModelGroup");
  const videoDurationGroup = $("#videoDurationGroup");
  const durationRow = $("#durationRow");
  const videoAudioGroup = $("#videoAudioGroup");
  const audioToggle = $("#audioToggle");
  const resLabel = $("#resLabel");
  const resGroup = $("#resGroup");
  const composerFootnote = $("#composerFootnote");
  const heroCredit = $("#heroCredit");
  const projectSelect = $("#projectSelect");
  const projectSearchInput = $("#projectSearch");
  const projectSortSelect = $("#projectSort");
  const projectFilterSelect = $("#projectFilter");
  const projectHintName = $("#projectHintName");
  const projectsBar = $("#projectsBar");
  const projectsPanel = $("#projectsPanel");
  const projectsBackdrop = $("#projectsBackdrop");
  const projectsList = $("#projectsList");
  const projectsSubtitle = $("#projectsSubtitle");
  const newProjectNameInput = $("#newProjectNameInput");
  const createProjectBtn = $("#createProjectBtn");
  const newProjectBtn = $("#newProjectBtn");
  const projectsToggle = $("#projectsToggle");
  const projectsCloseBtn = $("#projectsClose");
  const exportProjectsBtn = $("#exportProjectsBtn");
  const importProjectsFile = $("#importProjectsFile");
  const clearProjectsBtn = $("#clearProjectsBtn");
  const renameProjectBtn = $("#renameProjectBtn");
  const deleteProjectBtn = $("#deleteProjectBtn");

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

  let mode = localStorage.getItem("shilo_mode_v1") || "image";
  let videoModel = localStorage.getItem("shilo_video_model_v1") || VIDEO_MODELS[0].id;
  let videoDuration = localStorage.getItem("shilo_video_duration_v1") || "4";
  let videoResolution = localStorage.getItem("shilo_video_res_v1") || "720p";
  let audioEnabled = localStorage.getItem("shilo_audio_v1") !== "0";

  const PROJECTS_KEY = "shilo_workspace_projects_v1";
  const ACTIVE_PROJECT_KEY = "shilo_workspace_active_project_v1";
  let projects = [];
  let activeProjectId = localStorage.getItem(ACTIVE_PROJECT_KEY) || null;
  let projectSearch = "";
  let projectSort = localStorage.getItem("shilo_projects_sort_v1") || "newest";
  let projectFilter = localStorage.getItem("shilo_projects_filter_v1") || "all";

  const keyState = KEYS.map(() => ({
    failures: 0,
    cooldownUntil: 0,
    lastSuccess: 0,
    lastFailure: 0,
  }));
  let lastSuccessfulKey = -1;
  let busyKey = -1;

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
    renderVideoModelPills();
    renderDurationPills();
    renderKeyDots();
    updateKeyIndicator();
    loadHistory();
    loadProjects();
    migrateHistoryToProjects();
    ensureActiveProject();
    renderProjectsBar();
    renderProjectsList();
    renderMode();
    updateComposerFootnote();
    updateHeroCredit();
    if (projectSortSelect) projectSortSelect.value = projectSort;
    if (projectFilterSelect) projectFilterSelect.value = projectFilter;
    renderHistory();
    bindEvents();
    bindProjectEvents();
    bindModeEvents();
    autoGrow(promptInput);
    promptInput.focus({ preventScroll: true });
    if (KEYS.length === 0) {
      showToast("Configure OXY_API_KEY in the Pages Function to start generating.", "error");
    }
    const heroEyebrow = document.querySelector(".hero-eyebrow");
    if (heroEyebrow) heroEyebrow.innerHTML = '<span class="eyebrow-dot" aria-hidden="true"></span><span class="eyebrow-text">Available now — image studio for obsessives</span><span class="eyebrow-hairline" aria-hidden="true"></span>';
    initPolish();
    initMacDopamine();
  }

  function renderMode(){
    const isVideo = mode === "video";
    document.documentElement.setAttribute("data-mode", mode);
    if (modeSwitch){
      $$(".mode-btn", modeSwitch).forEach(b=>{
        const on = b.dataset.mode === mode;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", String(on));
      });
    }
    if (videoModelGroup) videoModelGroup.hidden = !isVideo;
    if (videoDurationGroup) videoDurationGroup.hidden = !isVideo;
    if (videoAudioGroup) videoAudioGroup.hidden = !isVideo;
    const imageOnly = document.getElementById("imageModelGroup");
    if (imageOnly) imageOnly.hidden = isVideo;
    if (isVideo){
      renderVideoModelPills();
      renderDurationPills();
      resLabel && (resLabel.textContent = "Resolution");
      renderResPillsVideo();
      promptInput.placeholder = reference ? "Describe motion — how should this animate…" : "Describe a video — what should happen…";
      generateBtn.querySelector(".generate-btn-label").textContent = "Generate Video";
      generateBtn.setAttribute("aria-label", "Generate video");
      if (modeHint) modeHint.textContent = VIDEO_MODELS.find(m=>m.id===videoModel)?.label || "Video";
    } else {
      renderResPillsImage();
      promptInput.placeholder = "Describe what you want to create…";
      generateBtn.querySelector(".generate-btn-label").textContent = "Generate";
      generateBtn.setAttribute("aria-label", "Generate image");
      if (modeHint) modeHint.textContent = "Nano Banana 2";
    }
    updateComposerFootnote();
    updateHeroCredit();
  }
  function setMode(m){
    if (m!== "image" && m!== "video") return;
    mode = m;
    localStorage.setItem("shilo_mode_v1", mode);
    renderMode();
    promptInput.focus();
  }
  function renderVideoModelPills(){
    if (!videoModelRow) return;
    videoModelRow.innerHTML = "";
    VIDEO_MODELS.forEach(vm=>{
      const b=document.createElement("button");
      b.type="button"; b.className="pill"; b.textContent=vm.label; b.dataset.model=vm.id;
      b.setAttribute("role","radio"); b.setAttribute("aria-checked", String(vm.id===videoModel));
      if(vm.id===videoModel) b.classList.add("is-active");
      b.addEventListener("click", ()=> setVideoModel(vm.id));
      videoModelRow.appendChild(b);
    });
  }
  function setVideoModel(id){
    if (!VIDEO_MODELS.some(m=>m.id===id)) return;
    videoModel=id;
    localStorage.setItem("shilo_video_model_v1", id);
    renderVideoModelPills();
    updateComposerFootnote();
    $$(".pill[data-model]", videoModelRow).forEach(el=>{
      const on=el.dataset.model===id;
      el.setAttribute("aria-checked", String(on));
      el.classList.toggle("is-active", on);
    });
  }
  function renderDurationPills(){
    if (!durationRow) return;
    $$(".pill", durationRow).forEach(el=>{
      const on = el.dataset.duration===videoDuration;
      el.setAttribute("aria-checked", String(on));
      el.classList.toggle("is-active", on);
    });
  }
  function setVideoDuration(v){
    videoDuration=String(v);
    localStorage.setItem("shilo_video_duration_v1", videoDuration);
    renderDurationPills();
    updateComposerFootnote();
  }
  function setVideoResolution(v){
    videoResolution=String(v);
    localStorage.setItem("shilo_video_res_v1", v);
    renderResPillsVideo();
    updateComposerFootnote();
  }
  function renderResPillsImage(){
    if (!resRow) return;
    resRow.innerHTML="";
    IMAGE_RESOLUTIONS.forEach(r=>{
      const b=document.createElement("button");
      b.type="button"; b.className="pill"; b.textContent=r; b.dataset.res=r;
      b.setAttribute("role","radio"); b.setAttribute("aria-checked", String(r===resolution));
      if(r===resolution) b.classList.add("is-active");
      b.addEventListener("click", ()=> setResolution(r));
      resRow.appendChild(b);
    });
  }
  function renderResPillsVideo(){
    if (!resRow) return;
    resRow.innerHTML="";
    VIDEO_RESOLUTIONS.forEach(r=>{
      const b=document.createElement("button");
      b.type="button"; b.className="pill"; b.textContent=r; b.dataset.res=r;
      b.setAttribute("role","radio"); b.setAttribute("aria-checked", String(r===videoResolution));
      if(r===videoResolution) b.classList.add("is-active");
      b.addEventListener("click", ()=> setVideoResolution(r));
      resRow.appendChild(b);
    });
  }
  function updateComposerFootnote(){
    if (!composerFootnote) return;
    if(mode==="video"){
      const vm = VIDEO_MODELS.find(m=>m.id===videoModel)?.label || videoModel;
      composerFootnote.innerHTML = `Videos via Oxyy · <strong style=\"color:rgba(255,255,255,0.52); font-weight:600\">${escapeHtml(vm)}</strong> · ${escapeHtml(videoDuration)}s · ${escapeHtml(videoResolution)} · ${audioEnabled?"Audio":"Silent"}`;
    } else {
      composerFootnote.innerHTML = `Images via Oxyy · <strong style=\"color:rgba(255,255,255,0.52); font-weight:600\">Nano Banana Pro</strong> · 60 credits/image · Keys stay in your browser`;
    }
  }
  function updateHeroCredit(){
    if (!heroCredit) return;
    if (mode==="video"){
      heroCredit.textContent = `Oxyy · ${VIDEO_MODELS.find(m=>m.id===videoModel)?.label || "Video"} · ${videoDuration}s · ${videoResolution}`;
    } else {
      const vm = VIDEO_MODELS.find(m=>m.id===videoModel)?.label || "Video";
      heroCredit.textContent = `Oxyy · Nano Banana · Veo · Grok Imagine`;
    }
  }

  function loadProjects(){
    try{
      const raw = localStorage.getItem(PROJECTS_KEY);
      if (raw){
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) { projects = parsed; return; }
      }
    }catch{}
    projects = [];
  }
  function persistProjects(){
    try{
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
      return true;
    } catch(e){
      if (isQuotaExceeded(e)) return handleProjectsQuotaExceeded();
      showToast("Could not save projects locally.", "error");
      return false;
    }
  }
  function handleProjectsQuotaExceeded(){
    let cloned = JSON.parse(JSON.stringify(projects));
    let attempts=0;
    while(attempts<6 && cloned.length){
      attempts++;
      let stripped=false;
      for(let i=cloned.length-1;i>=0;i--){
        for(let j=cloned[i].assets.length-1;j>=0;j--){
          if(cloned[i].assets[j].refThumb){ cloned[i].assets[j].refThumb=null; stripped=true; break; }
        }
        if(stripped) break;
      }
      if(!stripped){
        for(let i=cloned.length-1;i>=0;i--){
          if(cloned[i].assets.length>6){ cloned[i].assets = cloned[i].assets.slice(0,6); stripped=true; break; }
        }
      }
      if(!stripped) cloned.pop();
      try{ localStorage.setItem(PROJECTS_KEY, JSON.stringify(cloned)); projects=cloned; showToast("Storage full — trimmed older projects to save latest."); renderProjectsBar(); renderProjectsList(); renderHistory(); return true; }catch(e){ if(!isQuotaExceeded(e)) break; }
    }
    showToast("Local storage is full. Export and clear old projects.", "error");
    return false;
  }
  function ensureActiveProject(){
    if (!projects.length){
      const id = "proj_" + Date.now().toString(36);
      projects = [{ id, name: "My Studio", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), assets: [] }];
      activeProjectId = id;
      persistProjects();
      localStorage.setItem(ACTIVE_PROJECT_KEY, activeProjectId);
    }
    if (!activeProjectId || !projects.some(p=>p.id===activeProjectId)){
      activeProjectId = projects[0].id;
      localStorage.setItem(ACTIVE_PROJECT_KEY, activeProjectId);
    }
    renderProjectsBar();
  }
  function getActiveProject(){ return projects.find(p=>p.id===activeProjectId) || projects[0] || null; }
  function createProject(name){
    const clean = String(name||"").trim().slice(0,40) || `Studio ${projects.length+1}`;
    const id = "proj_" + Date.now().toString(36) + Math.random().toString(36).slice(2,4);
    const proj = { id, name: clean, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), assets: [] };
    projects.unshift(proj);
    activeProjectId = id;
    persistProjects();
    localStorage.setItem(ACTIVE_PROJECT_KEY, id);
    renderProjectsBar(); renderProjectsList(); renderHistory();
    showToast(`Project "${clean}" created.`);
    return proj;
  }
  function renameProject(id, newName){
    const proj = projects.find(p=>p.id===id);
    if(!proj) return;
    const clean = String(newName||"").trim().slice(0,40);
    if(!clean) { showToast("Project name cannot be empty.", "error"); return; }
    proj.name = clean; proj.updatedAt = new Date().toISOString();
    persistProjects(); renderProjectsBar(); renderProjectsList();
    showToast("Project renamed.");
  }
  function deleteProject(id){
    if(projects.length<=1){ showToast("Keep at least one project.", "error"); return; }
    const idx = projects.findIndex(p=>p.id===id);
    if(idx===-1) return;
    if(!confirm(`Delete project "${projects[idx].name}" and its ${projects[idx].assets.length} assets? This cannot be undone.`)) return;
    projects.splice(idx,1);
    if(activeProjectId===id){ activeProjectId = projects[0].id; localStorage.setItem(ACTIVE_PROJECT_KEY, activeProjectId); }
    persistProjects(); renderProjectsBar(); renderProjectsList(); renderHistory();
    showToast("Project deleted.");
  }
  function switchProject(id){
    if(!projects.some(p=>p.id===id)) return;
    activeProjectId=id;
    localStorage.setItem(ACTIVE_PROJECT_KEY, id);
    renderProjectsBar(); renderProjectsList(); renderHistory();
    thread.querySelectorAll(".gen-card").forEach(c=> c.classList.remove("is-highlight"));
    showToast(`Switched to "${projects.find(p=>p.id===id).name}".`);
  }
  function renderProjectsBar(){
    if (!projectSelect) return;
    projectSelect.innerHTML="";
    projects.forEach(p=>{
      const o=document.createElement("option");
      o.value=p.id; o.textContent=`${p.name} · ${p.assets.length}`;
      if(p.id===activeProjectId) o.selected=true;
      projectSelect.appendChild(o);
    });
    if(projectHintName){
      const active = getActiveProject();
      projectHintName.textContent = active ? active.name : "—";
    }
    if(projectsSubtitle){
      const total = projects.reduce((a,p)=>a+p.assets.length,0);
      projectsSubtitle.textContent = `${projects.length} projects · ${total} assets · local only`;
    }
  }
  function renderProjectsList(){
    if (!projectsList) return;
    projectsList.innerHTML="";
    projects.forEach(proj=>{
      const row=document.createElement("div");
      row.className="project-row" + (proj.id===activeProjectId ? " is-active" : "");
      row.setAttribute("role","listitem");
      const isActive = proj.id===activeProjectId;
      row.innerHTML=`
        <div class="project-row-main" data-id="${escapeAttr(proj.id)}" role="button" tabindex="0" aria-label="Switch to ${escapeAttr(proj.name)}">
          <span class="project-row-name">${escapeHtml(proj.name)}${isActive ? ' · active' : ''}</span>
          <span class="project-row-meta">${proj.assets.length} assets · ${escapeHtml(formatTime(proj.updatedAt))} · ${escapeHtml(proj.assets.filter(a=>a.type==="video").length)} videos</span>
        </div>
        <div class="project-row-actions">
          <button class="text-btn text-btn--small" data-action="rename" data-id="${escapeAttr(proj.id)}" type="button">Rename</button>
          <button class="text-btn text-btn--small text-btn--danger" data-action="delete" data-id="${escapeAttr(proj.id)}" type="button" ${projects.length<=1?"disabled":""}>Delete</button>
        </div>
      `;
      row.querySelector(".project-row-main").addEventListener("click", ()=> switchProject(proj.id));
      row.querySelector(".project-row-main").addEventListener("keydown", e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); switchProject(proj.id); }});
      row.querySelector('[data-action="rename"]').addEventListener("click", ()=>{
        const nv = prompt("Rename project:", proj.name);
        if(nv!=null) renameProject(proj.id, nv);
      });
      row.querySelector('[data-action="delete"]').addEventListener("click", ()=> deleteProject(proj.id));
      projectsList.appendChild(row);
    });
  }
  function migrateHistoryToProjects(){
    try{
      const raw = localStorage.getItem(HISTORY_KEY);
      if(!raw) return;
      const hist = JSON.parse(raw);
      if(!Array.isArray(hist) || !hist.length) return;
      if(localStorage.getItem("shilo_migrated_v1")==="1") return;
      loadProjects();
      if(!projects.length){
        projects=[{ id: "proj_" + Date.now().toString(36), name: "My Studio", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), assets: [] }];
      }
      const target = projects[0];
      let migrated=0;
      for(const h of hist){
        if(target.assets.some(a=>a.mediaUrl===h.imageData && a.prompt===h.prompt)) continue;
        target.assets.unshift({
          id: h.id || ("asset_" + Date.now().toString(36) + Math.random().toString(36).slice(2,4)),
          projectId: target.id,
          type: h.type || (h.videoUrl ? "video":"image"),
          prompt: h.prompt || "",
          model: h.model || IMAGE_MODEL,
          mode: h.mode || "image",
          aspect: h.aspect || "1:1",
          resolution: h.resolution || "1K",
          duration: h.duration || null,
          audio: h.audio ?? null,
          mediaUrl: h.imageData || h.videoUrl || h.mediaUrl || "",
          mime: h.mime || (h.type==="video" ? "video/mp4" : "image/png"),
          poster: h.poster || null,
          timestamp: h.timestamp || new Date().toISOString(),
          tags: Array.isArray(h.tags) ? h.tags : [],
          title: h.title || h.prompt?.slice(0,40) || "",
          refThumb: h.refThumb || null
        });
        migrated++;
        if(target.assets.length>48) target.assets = target.assets.slice(0,48);
      }
      if(migrated){
        projects[0].updatedAt = new Date().toISOString();
        persistProjects();
        activeProjectId = projects[0].id;
        localStorage.setItem(ACTIVE_PROJECT_KEY, activeProjectId);
        localStorage.setItem("shilo_migrated_v1","1");
        showToast(`Migrated ${migrated} items to "${projects[0].name}".`);
      } else {
        localStorage.setItem("shilo_migrated_v1","1");
      }
    }catch(e){ console.warn("migrate failed", e); }
  }
  function getFilteredAssets(){
    const proj = getActiveProject();
    if(!proj) return [];
    let assets = [...proj.assets];
    const q = projectSearch.trim().toLowerCase();
    if(q){
      assets = assets.filter(a=>{
        const hay = `${a.prompt||""} ${a.title||""} ${(a.tags||[]).join(" ")} ${a.model||""}`.toLowerCase();
        return hay.includes(q);
      });
    }
    if(projectFilter==="image") assets = assets.filter(a=>a.type==="image");
    else if(projectFilter==="video") assets = assets.filter(a=>a.type==="video");
    if(projectSort==="newest") assets.sort((a,b)=> new Date(b.timestamp)-new Date(a.timestamp));
    else if(projectSort==="oldest") assets.sort((a,b)=> new Date(a.timestamp)-new Date(b.timestamp));
    else if(projectSort==="image") assets.sort((a,b)=> (a.type===b.type?0:a.type==="image"?-1:1));
    else if(projectSort==="video") assets.sort((a,b)=> (a.type===b.type?0:a.type==="video"?-1:1));
    return assets;
  }
  function addAssetToProject(asset){
    const proj = getActiveProject();
    if(!proj) return null;
    asset.id = asset.id || ("asset_" + Date.now().toString(36) + Math.random().toString(36).slice(2,4));
    asset.projectId = proj.id;
    asset.timestamp = asset.timestamp || new Date().toISOString();
    proj.assets.unshift(asset);
    if(proj.assets.length>96) proj.assets = proj.assets.slice(0,96);
    proj.updatedAt = new Date().toISOString();
    persistProjects(); renderProjectsBar(); renderProjectsList(); renderHistory();
    return asset;
  }
  function updateProjectAsset(assetId, patch){
    for(const proj of projects){
      const a = proj.assets.find(x=>x.id===assetId);
      if(a){ Object.assign(a, patch); proj.updatedAt=new Date().toISOString(); persistProjects(); renderProjectsBar(); renderProjectsList(); renderHistory(); return a; }
    }
    return null;
  }
  function deleteAsset(assetId){
    for(const proj of projects){
      const idx = proj.assets.findIndex(x=>x.id===assetId);
      if(idx!==-1){ proj.assets.splice(idx,1); proj.updatedAt=new Date().toISOString(); persistProjects(); renderProjectsBar(); renderProjectsList(); renderHistory(); showToast("Asset deleted."); return true; }
    }
    return false;
  }
  function exportProjects(){
    if(!projects.length){ showToast("No projects to export."); return; }
    const payload = { version: 1, exportedAt: new Date().toISOString(), projects };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download=`shilo-projects-${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
    showToast("Projects exported.");
  }
  function importProjects(file){
    const reader=new FileReader();
    reader.onload=()=>{
      try{
        const data=JSON.parse(String(reader.result));
        const incoming = Array.isArray(data) ? data : data.projects;
        if(!Array.isArray(incoming) || !incoming.length) throw new Error("No projects found.");
        let imported=0;
        for(const p of incoming){
          if(!p || !p.name) continue;
          const proj = {
            id: p.id && !projects.some(x=>x.id===p.id) ? p.id : ("proj_" + Date.now().toString(36) + Math.random().toString(36).slice(2,4) + imported),
            name: String(p.name).slice(0,40) || `Imported ${imported+1}`,
            createdAt: p.createdAt || new Date().toISOString(),
            updatedAt: p.updatedAt || new Date().toISOString(),
            assets: Array.isArray(p.assets) ? p.assets.slice(0,96).map(a=>({
              id: a.id || ("asset_" + Math.random().toString(36).slice(2,8)),
              projectId: "",
              type: a.type==="video" ? "video" : "image",
              prompt: String(a.prompt||"").slice(0,4000),
              model: String(a.model||IMAGE_MODEL),
              mode: a.mode==="video" ? "video":"image",
              aspect: a.aspect||"1:1",
              resolution: a.resolution||"1K",
              duration: a.duration||null,
              audio: a.audio??null,
              mediaUrl: a.mediaUrl||a.imageData||a.videoUrl||"",
              mime: a.mime|| (a.type==="video"?"video/mp4":"image/png"),
              timestamp: a.timestamp|| new Date().toISOString(),
              tags: Array.isArray(a.tags)? a.tags.slice(0,12).map(t=>String(t).slice(0,20)) : [],
              title: String(a.title||a.prompt||"").slice(0,60),
              refThumb: a.refThumb||null
            })).filter(a=>a.mediaUrl) : []
          };
          proj.assets.forEach(a=> a.projectId=proj.id);
          projects.push(proj); imported++;
        }
        persistProjects(); ensureActiveProject(); renderProjectsBar(); renderProjectsList(); renderHistory();
        showToast(`Imported ${imported} project(s).`);
      }catch(e){ showToast("Import failed: " + (e.message||"invalid JSON"), "error"); }
    };
    reader.readAsText(file);
  }
  function bindProjectEvents(){
    projectSelect?.addEventListener("change", e=> switchProject(e.target.value));
    renameProjectBtn?.addEventListener("click", ()=>{
      const proj=getActiveProject(); if(!proj) return;
      const nv=prompt("Rename project:", proj.name);
      if(nv!=null) renameProject(proj.id, nv);
    });
    deleteProjectBtn?.addEventListener("click", ()=>{
      const proj=getActiveProject(); if(proj) deleteProject(proj.id);
    });
    newProjectBtn?.addEventListener("click", ()=>{
      const name=prompt("New project name:", `Studio ${projects.length+1}`);
      if(name!=null) createProject(name);
    });
    createProjectBtn?.addEventListener("click", ()=>{
      const v=newProjectNameInput?.value?.trim();
      if(v) { createProject(v); if(newProjectNameInput) newProjectNameInput.value=""; }
    });
    newProjectNameInput?.addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); createProjectBtn.click(); }});
    projectSearchInput?.addEventListener("input", e=>{ projectSearch=e.target.value; renderHistory(); });
    projectSortSelect?.addEventListener("change", e=>{ projectSort=e.target.value; localStorage.setItem("shilo_projects_sort_v1", projectSort); renderHistory(); });
    projectFilterSelect?.addEventListener("change", e=>{ projectFilter=e.target.value; localStorage.setItem("shilo_projects_filter_v1", projectFilter); renderHistory(); });
    projectsToggle?.addEventListener("click", openProjects);
    projectsCloseBtn?.addEventListener("click", closeProjects);
    projectsBackdrop?.addEventListener("click", closeProjects);
    exportProjectsBtn?.addEventListener("click", exportProjects);
    importProjectsFile?.addEventListener("change", e=>{
      const f=e.target.files?.[0]; if(f) { importProjects(f); e.target.value=""; }
    });
    clearProjectsBtn?.addEventListener("click", ()=>{
      if(!projects.length) return;
      if(!confirm("Clear all projects? This will keep a fresh default project. Export first if you want a backup.")) return;
      projects=[{ id:"proj_"+Date.now().toString(36), name:"My Studio", createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), assets:[] }];
      activeProjectId=projects[0].id;
      persistProjects(); localStorage.setItem(ACTIVE_PROJECT_KEY, activeProjectId);
      renderProjectsBar(); renderProjectsList(); renderHistory();
      showToast("Projects cleared.");
    });
    window.addEventListener("keydown", e=>{
      if(e.key==="Escape" && projectsPanel?.classList.contains("is-open")) closeProjects();
    });
  }
  function bindModeEvents(){
    modeSwitch?.addEventListener("click", e=>{
      const b=e.target.closest(".mode-btn");
      if(b) setMode(b.dataset.mode);
    });
    durationRow?.addEventListener("click", e=>{
      const p=e.target.closest(".pill[data-duration]");
      if(p) setVideoDuration(p.dataset.duration);
    });
    audioToggle?.addEventListener("change", e=>{
      audioEnabled = e.target.checked;
      localStorage.setItem("shilo_audio_v1", audioEnabled?"1":"0");
      updateComposerFootnote();
    });
  }
  function openProjects(){
    if(!projectsPanel) return;
    projectsPanel.classList.add("is-open");
    projectsPanel.removeAttribute("inert");
    projectsPanel.setAttribute("aria-hidden","false");
    projectsBackdrop.hidden=false;
    projectsToggle?.setAttribute("aria-expanded","true");
    document.body.style.overflow="hidden";
    renderProjectsList();
  }
  function closeProjects(){
    if(!projectsPanel) return;
    projectsPanel.classList.remove("is-open");
    projectsPanel.setAttribute("aria-hidden","true");
    projectsPanel.setAttribute("inert","");
    projectsBackdrop.hidden=true;
    projectsToggle?.setAttribute("aria-expanded","false");
    document.body.style.overflow = historyPanel?.classList.contains("is-open") ? "hidden" : "";
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
        countEl.animate?.([{transform:"scale(1)"},{transform:"scale(1.08)"},{transform:"scale(1)"}],{duration:320, easing:"cubic-bezier(.22,1,.36,1)"});
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
      const colors = ["#E8D9B8","#F7F2E6","#D8C9A8","#C9B895","#fffaf0"];
      for(let i=0;i<count;i++){
        const angle = (Math.PI*2 * i/count) + (Math.random()*0.5-0.25);
        const speed = 2.2 + Math.random()*4.2;
        const size = 3 + Math.random()*4;
        particles.push({
          x, y,
          vx: Math.cos(angle)*speed + (Math.random()-0.5)*1.2,
          vy: Math.sin(angle)*speed - Math.random()*1.8 - 1.2,
          size, rot: Math.random()*360, vr: (Math.random()-0.5)*6,
          color: colors[Math.floor(Math.random()*colors.length)],
          life: 1, decay: 0.008 + Math.random()*0.009,
          shape: Math.random()<0.62 ? "rect":"circle",
          gravity: 0.14 + Math.random()*0.08
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
        o.type="sine"; o.frequency.value=320 + Math.random()*120;
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
      const cy = rect ? rect.top + rect.height*0.30 : window.innerHeight/2;
      burstConfetti({x: cx, y: cy, count: 28});
      sparkleBurst(cardEl || document.body, 6);
      hapticPop(0.7);
      if (cardEl){
        cardEl.classList.add("is-success");
        cardEl.animate?.([{transform:"scale(0.995)", filter:"brightness(1)"},{transform:"scale(1.008)", filter:"brightness(1.03)"},{transform:"scale(1)", filter:"brightness(1)"}],{duration:720, easing:"cubic-bezier(.22,1,.36,1)"});
        const img = cardEl.querySelector("img");
        if (img){
          img.animate?.([{filter:"brightness(1.04) saturate(1.04)", transform:"scale(1.01)"},{filter:"none", transform:"scale(1)"}],{duration:560, easing:"cubic-bezier(.22,1,.36,1)"});
        }
      }
    };

    document.querySelectorAll(".traffic-dot").forEach(d=>{
      d.addEventListener("click", ()=>{
        d.animate?.([{transform:"scale(0.92)"},{transform:"scale(1.04)"},{transform:"scale(1)"}],{duration:320, easing:"cubic-bezier(.22,1,.36,1)"});
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
      const isVideo = !lightboxVideo.hidden && lightboxVideo.src;
      const src = isVideo ? lightboxVideo.src : lightboxImg.src;
      const name = isVideo ? (lightboxVideo.dataset.filename || "shilo-video.mp4") : (lightboxImg.dataset.filename || "shilo-image.png");
      if (!src) { showToast("No media to download.", "error"); return; }
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

  function isFollowUpPrompt(s){
    const t = String(s||"").toLowerCase();
    return /\b(keep|same|still|again|previous|last|scene|character|subject|outfit|style|background|continue|from before|earlier|that cat|that dog|that person|take.*from|keep.*in|use previous|same cat|same dog|same person|as before)\b/i.test(t);
  }
  function getLastImageAsset(){
    const proj = getActiveProject();
    if (proj){
      for(let i=0;i<proj.assets.length;i++){
        const a=proj.assets[i];
        if(a && a.type==="image" && a.mediaUrl) return a;
      }
    }
    for(let i=history.length-1;i>=0;i--){
      const h=history[i];
      if(h && h.imageData) return { mediaUrl: h.imageData, prompt: h.prompt, title: h.prompt };
    }
    const lastCard = [...thread.querySelectorAll(".gen-card img")].pop();
    if(lastCard && lastCard.src) return { mediaUrl: lastCard.src };
    return null;
  }
  function getRecentContextPrompts(limit=3){
    const out=[];
    const proj=getActiveProject();
    if(proj && proj.assets.length){
      for(let i=0;i<Math.min(limit, proj.assets.length); i++){
        const a=proj.assets[i];
        if(a && a.prompt) out.push(a.prompt);
      }
    } else if(history.length){
      for(let i=Math.max(0, history.length-limit); i<history.length; i++){
        if(history[i]?.prompt) out.push(history[i].prompt);
      }
    }
    return out;
  }
  function buildContextPrompt(current, recents){
    if(!recents || !recents.length) return current;
    const recentStr = recents.slice(0,2).map((p,i)=>`Scene ${recents.length-i}: ${p.slice(0,120)}`).join(" | ");
    if (isFollowUpPrompt(current)) return `${recentStr}\n\nFollow-up instruction: ${current}\nKeep consistent subject/style from above unless told otherwise.`;
    return current;
  }
  function refFromAsset(asset){
    if(!asset || !asset.mediaUrl) return null;
    const url = asset.mediaUrl;
    if(url.startsWith("data:")){
      const m = url.match(/^data:([^;]+);base64,(.*)$/);
      if(m) return { base64: m[2], mime: m[1], dataUrl: url, name: asset.title||"previous", size: (m[2].length*3/4), sizeLabel: "" };
    }
    return null;
  }

  async function submitPrompt() {
    if (isGenerating) return;
    const rawPrompt = promptInput.value.trim();
    const prompt = rawPrompt;
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
    const activeProj = getActiveProject();
    if (!activeProj){
      showToast("Create a project first.", "error");
      ensureActiveProject();
      return;
    }

    const aspect = aspectRatio;
    const res = mode === "video" ? videoResolution : resolution;
    let refForThis = reference ? { ...reference } : null;
    let effectivePrompt = prompt;
    let contextUsed = false;
    const recents = getRecentContextPrompts(2);
    if (!refForThis && isFollowUpPrompt(prompt)){
      const lastAsset = getLastImageAsset();
      const maybeRef = refFromAsset(lastAsset);
      if (maybeRef){
        refForThis = maybeRef;
        contextUsed = true;
      }
    }
    if (recents.length && isFollowUpPrompt(prompt)){
      effectivePrompt = buildContextPrompt(prompt, recents);
      contextUsed = true;
    }

    if (hero.style.display !== "none") {
      hero.style.display = "none";
    }

    const isVideo = mode === "video";
    const videoOpts = isVideo ? { model: videoModel, duration: videoDuration, resolution: videoResolution, aspect, audio: audioEnabled } : null;

    lastPrompt = effectivePrompt;
    lastSettings = isVideo ? { mode, model: videoModel, duration: videoDuration, resolution: videoResolution, aspect, audio: audioEnabled, contextUsed } : { mode, aspect, res, contextUsed };
    lastReferenceForRetry = refForThis;

    const displayPrompt = contextUsed ? `${prompt}  ·  ↳ using previous scene` : prompt;
    const userEl = createUserMessage(displayPrompt, refForThis, isVideo ? videoOpts : null);
    if (contextUsed && refForThis){
      const ctxPill = document.createElement("div");
      ctxPill.className = "msg-meta";
      ctxPill.innerHTML = `<span class="meta-pill" style="background:rgba(232,217,184,0.09); border-color:rgba(232,217,184,0.14); color: var(--champagne)">↳ Follow-up: using previous image + last ${recents.length} prompts as context</span>`;
      userEl.appendChild(ctxPill);
    }
    thread.appendChild(userEl);
    const assistantCard = createGeneratingCard(effectivePrompt, isVideo ? videoOpts : { aspect, res }, isVideo);
    thread.appendChild(assistantCard);
    scrollToBottom();

    promptInput.value = "";
    autoGrow(promptInput);
    if (reference) clearReference();

    setGenerating(true);
    updateKeyIndicator();

    try {
      const idempotencyKey = (crypto.randomUUID && crypto.randomUUID()) || (Date.now().toString(36)+Math.random().toString(36).slice(2));
      let result;
      if (isVideo){
        result = await generateVideoWithFailover(effectivePrompt, refForThis, videoOpts, assistantCard, idempotencyKey);
        if (result) {
          finalizeCardSuccessVideo(assistantCard, result, prompt, videoOpts);
          const asset = {
            type: "video",
            prompt,
            model: videoModel,
            mode: "video",
            aspect,
            resolution: videoResolution,
            duration: Number(videoDuration),
            audio: audioEnabled,
            mediaUrl: result.videoUrl,
            mime: "video/mp4",
            poster: result.poster || refForThis?.dataUrl || null,
            tags: [],
            title: prompt.slice(0,60),
            contextPrompt: contextUsed ? effectivePrompt : null
          };
          addAssetToProject(asset);
          addToHistory({ prompt, imageData: result.videoUrl, mime: "video/mp4", aspect, res: videoResolution, refThumb: refForThis?.dataUrl || null, type:"video", model: videoModel, duration: Number(videoDuration), audio: audioEnabled, videoUrl: result.videoUrl });
          showToast(`Video ready — ${videoModel} · ${videoDuration}s`);
        }
      } else {
        result = await generateWithFailover(effectivePrompt, refForThis, aspect, res, assistantCard, idempotencyKey);
        if (result) {
          finalizeCardSuccess(assistantCard, result, prompt, aspect, res);
          const asset = {
            type: "image",
            prompt,
            model: IMAGE_MODEL,
            mode: "image",
            aspect,
            resolution: res,
            mediaUrl: result.dataUrl,
            mime: result.mime,
            poster: null,
            tags: [],
            title: prompt.slice(0,60),
            contextPrompt: contextUsed ? effectivePrompt : null
          };
          addAssetToProject(asset);
          addToHistory({ prompt, imageData: result.dataUrl, mime: result.mime, aspect, res, refThumb: refForThis?.dataUrl || null, type:"image", model: IMAGE_MODEL });
        }
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

  function createUserMessage(prompt, ref, videoOpts) {
    const wrap = document.createElement("div");
    wrap.className = "message";
    const isVideo = !!videoOpts;
    const activeProj = getActiveProject();
    const projName = activeProj ? activeProj.name : "—";
    const metaPills = isVideo
      ? `<span class="meta-pill">${escapeHtml(videoOpts.model)} · ${escapeHtml(videoOpts.duration)}s · ${escapeHtml(videoOpts.resolution)} · ${escapeHtml(videoOpts.aspect)}${videoOpts.audio?" · Audio":""}</span>`
      : `<span class="meta-pill">${escapeHtml(aspectRatio)} · ${escapeHtml(resolution)}</span>`;
    wrap.innerHTML = `
      <div class="msg-role msg-role--user"><span class="msg-role-dot" aria-hidden="true"></span> You · <span style="text-transform:none; letter-spacing:-0.01em; font-weight:600; color: rgba(247,242,230,0.62)">${escapeHtml(projName)}</span></div>
      ${ref ? `<img class="msg-ref-thumb" src="${escapeAttr(ref.dataUrl)}" alt="Reference image for: ${escapeAttr(prompt.slice(0,80))}" loading="lazy" />` : ``}
      <p class="msg-prompt">${escapeHtml(prompt)}</p>
      <div class="msg-meta">
        ${metaPills}
        ${ref ? `<span class="meta-pill">Reference · ${escapeHtml(ref.mime.split("/")[1])}</span>` : ``}
        <span class="meta-pill">${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
        <span class="meta-pill">${escapeHtml(isVideo ? "Video" : "Image")} · ${escapeHtml(projName)}</span>
      </div>
    `;
    return wrap;
  }

  function createGeneratingCard(prompt, opts, isVideo) {
    const el = document.createElement("div");
    el.className = "message";
    let aspect, res, modelLabel, subText, titleText;
    if (isVideo){
      aspect = opts.aspect; res = opts.resolution; modelLabel = VIDEO_MODELS.find(m=>m.id===opts.model)?.label || opts.model;
      subText = `${escapeHtml(opts.model)} · ${escapeHtml(String(opts.duration))}s · ${escapeHtml(opts.resolution)} · ${escapeHtml(opts.aspect)}${opts.audio?" · Audio":""}`;
      titleText = `Generating video — ${modelLabel}`;
    } else {
      aspect = opts.aspect; res = opts.res; modelLabel = DISPLAY_MODEL;
      subText = `${escapeHtml(aspect)} · ${escapeHtml(res)} · ${escapeHtml(DISPLAY_MODEL)} · Oxyy`;
      titleText = "Generating";
    }
    el.innerHTML = `
      <div class="msg-role msg-role--assistant"><span class="msg-role-dot" aria-hidden="true"></span> Shilo Studio · ${escapeHtml(isVideo ? (VIDEO_MODELS.find(m=>m.id===opts.model)?.label || "Video") : DISPLAY_MODEL)}${isVideo && opts.audio ? " · Audio" : ""}</div>
      <div class="gen-card ${isVideo ? "gen-card--video" : ""}" data-state="loading">
        <div class="gen-card-media" aria-busy="true" aria-label="${isVideo ? "Generating video" : "Generating image"}">
          <div class="gen-card-shimmer" aria-hidden="true"></div>
          <div class="gen-loader">
            <div class="gen-loader-dots" aria-hidden="true"><span></span><span></span><span></span></div>
            <div class="gen-loader-text">${isVideo ? `Composing video with ${escapeHtml(modelLabel)}…` : `Composing with ${escapeHtml(DISPLAY_MODEL)}…`}</div>
            <div class="gen-loader-sub">${escapeHtml(prompt.slice(0,72))}${prompt.length>72?"…":""} · ${subText}</div>
          </div>
          <div class="gen-progress" aria-hidden="true"><div class="gen-progress-bar"></div></div>
        </div>
        <div class="gen-card-footer">
          <div class="gen-card-info">
            <span class="gen-card-title">${titleText}</span>
            <span class="gen-card-sub">${subText} · ${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
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

  function finalizeCardSuccessVideo(card, result, prompt, opts){
    const genCard = card.querySelector(".gen-card");
    if (!genCard) return;
    card.dataset.done = "success";
    const safePrompt = escapeAttr(prompt.slice(0,140));
    genCard.dataset.state = "done";
    const videoUrl = result.videoUrl;
    const poster = result.poster || "";
    const modelLabel = VIDEO_MODELS.find(m=>m.id===opts.model)?.label || opts.model;
    genCard.innerHTML = `
      <div class="gen-card-media">
        <video src="${escapeAttr(videoUrl)}" poster="${escapeAttr(poster)}" controls playsinline preload="metadata" style="width:100%; border-radius:14px; background:#0B0B0D"></video>
        <div class="gen-card-shimmer" aria-hidden="true" style="display:none"></div>
      </div>
      <div class="gen-card-footer">
        <div class="gen-card-info">
          <span class="gen-card-title" title="${safePrompt}">${escapeHtml(prompt.slice(0,56))}${prompt.length>56?"…":""}</span>
          <span class="gen-card-sub">${escapeHtml(opts.model)} · ${escapeHtml(String(opts.duration))}s · ${escapeHtml(opts.resolution)} · ${escapeHtml(opts.aspect)}${opts.audio?" · Audio":""} · ${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
        </div>
        <div class="gen-card-actions">
          <button class="btn btn--ghost" type="button" data-action="retry" aria-label="Retry generation">Retry</button>
          <button class="btn btn--primary" type="button" data-action="download" aria-label="Download video">Download</button>
          <button class="btn btn--ghost" type="button" data-action="open" aria-label="Open in lightbox">Open</button>
        </div>
      </div>
      <div class="asset-card-meta-row" style="padding:0 14px 10px; display:flex; gap:6px; flex-wrap:wrap; align-items:center">
        <span class="meta-pill">Project · ${escapeHtml(getActiveProject()?.name||"—")}</span>
        <span class="meta-pill">${escapeHtml(modelLabel)}</span>
      </div>
    `;
    const videoEl = genCard.querySelector("video");
    videoEl.addEventListener("click", ()=> openLightbox(videoUrl, prompt, "video"));
    genCard.querySelector('[data-action="download"]').addEventListener("click", ()=>{
      const filename = `shilo-${Date.now()}-${opts.aspect.replace(":","x")}-${opts.duration}s.mp4`;
      downloadDataUrl(videoUrl, filename);
    });
    genCard.querySelector('[data-action="retry"]').addEventListener("click", ()=>{
      if(lastPrompt){
        promptInput.value = lastPrompt;
        if(lastSettings){
          if(lastSettings.mode==="video"){
            setMode("video"); setVideoModel(lastSettings.model); setVideoDuration(lastSettings.duration); setVideoResolution(lastSettings.resolution); setAspect(lastSettings.aspect);
            if(typeof lastSettings.audio==="boolean"){ audioEnabled=lastSettings.audio; if(audioToggle) audioToggle.checked=audioEnabled; }
          } else {
            setMode("image"); setAspect(lastSettings.aspect); setResolution(lastSettings.res);
          }
        }
        if(lastReferenceForRetry){ reference={...lastReferenceForRetry}; showReference(); }
        autoGrow(promptInput); submitPrompt();
      }
    });
    genCard.querySelector('[data-action="open"]').addEventListener("click", ()=> openLightbox(videoUrl, prompt, "video"));
    scrollToBottom();
    requestAnimationFrame(()=>{
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
  async function generateWithFailover(prompt, ref, aspect, res, card, idempotencyKey) {
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
        const result = await callOxyy(prompt, ref, aspect, res, idempotencyKey);
        keyState[keyIdx].lastSuccess = Date.now();
        keyState[keyIdx].failures = 0;
        keyState[keyIdx].cooldownUntil = 0;
        lastSuccessfulKey = keyIdx;
        busyKey = -1;
        updateKeyIndicator();
        if (result.proxy){
          showToast(`Image ready — Key ${result.proxy.keyIndex}/${result.proxy.totalKeys} · ${result.proxy.model} · 60 credits used.`);
        } else {
          showToast("Image ready — 60 credits used.");
        }
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

  async function callOxyy(prompt, ref, aspect, res, idempotencyKey) {
    const url = `${BASE_URL}/images/generations`;
    const size = getOxyySize(aspect, res);

    const body = {
      model: MODEL,
      prompt: prompt,
      n: 1,
      size: size,
      response_format: "b64_json"
    };

    if (ref && ref.base64) {
      const dataUrl = ref.dataUrl || `data:${ref.mime || "image/png"};base64,${ref.base64}`;
      body.image = dataUrl;
      body.reference_image = dataUrl;
      body.input_image = dataUrl;
      body.images = [dataUrl];
    }

    body.aspect_ratio = aspect;
    body.resolution = res;

    const headers = { "Content-Type": "application/json" };
    if (idempotencyKey) headers["X-Idempotency-Key"] = idempotencyKey;

    let resp;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      });
    } catch (e) {
      throw { status: 0, code: "network", message: "Couldn't reach Oxyy. Check your connection and try again.", title: "Couldn't reach Oxyy", rawMessage: String(e) };
    }

    const proxyIndex = resp.headers.get("x-proxy-key-index");
    const proxyTotal = resp.headers.get("x-proxy-total-keys");
    const proxyModel = resp.headers.get("x-proxy-model");

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
        return { dataUrl, mime, base64: b64, text: extractOxyyText(data) || "", raw: data, isUrl: true, proxy: proxyIndex ? { keyIndex: parseInt(proxyIndex,10), totalKeys: parseInt(proxyTotal||"1",10), model: proxyModel || MODEL } : null };
      }
    } else {
      b64 = b64.replace(/\s+/g, "");
      if (!b64 || b64.length < 100) {
        throw { status: 502, message: "Received incomplete image data. Please try again.", title: "Incomplete image" };
      }
      dataUrl = `data:${mime};base64,${b64}`;
    }

    const text = extractOxyyText(data) || "";
    return { dataUrl, mime, base64: b64, text, raw: data, proxy: proxyIndex ? { keyIndex: parseInt(proxyIndex,10), totalKeys: parseInt(proxyTotal||"1",10), model: proxyModel || MODEL } : null };
  }

  async function callOxyyVideo(prompt, ref, opts, idempotencyKey){
    const url = `${BASE_URL}/videos/generations`;
    const body = {
      model: opts.model,
      prompt: prompt,
      duration: Number(opts.duration) || 4,
      resolution: opts.resolution || "720p",
      aspect_ratio: opts.aspect || aspectRatio,
      aspectRatio: opts.aspect || aspectRatio
    };
    if (opts.audio === false) body.generate_audio = false;
    else if (opts.audio === true) body.generate_audio = true;
    if (opts.audio != null) body.audio = !!opts.audio;

    if (ref && ref.base64){
      const dataUrl = ref.dataUrl || `data:${ref.mime||"image/png"};base64,${ref.base64}`;
      body.image = dataUrl;
      body.image_base64 = ref.base64;
      body.input_image = dataUrl;
      body.reference_image = dataUrl;
      body.imageBase64 = ref.base64;
    }
    body.n = 1;

    const headers = { "Content-Type": "application/json" };
    if (idempotencyKey) headers["X-Idempotency-Key"] = idempotencyKey;

    let resp;
    try{
      resp = await fetch(url, { method:"POST", headers, body: JSON.stringify(body) });
    } catch(e){
      throw { status:0, code:"network", message:"Couldn't reach Oxyy. Check your connection and try again.", title:"Couldn't reach Oxyy", rawMessage: String(e) };
    }

    const proxyIndex = resp.headers.get("x-proxy-key-index");
    const proxyTotal = resp.headers.get("x-proxy-total-keys");
    const proxyModel = resp.headers.get("x-proxy-model");

    if (!resp.ok){
      let data=null; let text="";
      try{ text=await resp.text(); data=text ? JSON.parse(text):null; }catch{}
      const rawMsg = data?.error?.message || data?.message || text || `Request failed (${resp.status})`;
      let retryDelay="";
      try{
        const ra = resp.headers.get("retry-after") || resp.headers.get("Retry-After");
        if(ra) retryDelay = ra+"s";
      }catch{}
      const sanitized = sanitizeApiMessage(rawMsg);
      throw { status: resp.status, message: sanitized, rawMessage: rawMsg, title: titleForStatus(resp.status), code: String(resp.status), raw: data, retryDelay, proxy: proxyIndex ? { keyIndex: parseInt(proxyIndex,10), totalKeys: parseInt(proxyTotal||"1",10), model: proxyModel || opts.model } : null };
    }

    let data;
    try{ data = await resp.json(); }catch{ throw { status:502, message:"Received a malformed response from Oxyy. Please try again.", title:"Unexpected response" }; }

    const videoUrl = data?.video_url || data?.videoUrl || data?.url || data?.data?.video_url || data?.output?.[0]?.url || data?.data?.url;
    const jobId = data?.id || data?.job_id || data?.task_id;
    const status = data?.status || data?.state;

    if (videoUrl){
      return { videoUrl, poster: ref?.dataUrl || null, mime:"video/mp4", raw:data, status: status || "completed", proxy: proxyIndex ? { keyIndex: parseInt(proxyIndex,10), totalKeys: parseInt(proxyTotal||"1",10), model: proxyModel || opts.model } : (data._shilo_proxy||null), jobId };
    }
    if (jobId && (status==="queued" || status==="in_progress" || status==="processing" || status==="running")){
      return { videoUrl: null, jobId, status, raw:data, proxy: proxyIndex ? { keyIndex: parseInt(proxyIndex,10), totalKeys: parseInt(proxyTotal||"1",10), model: proxyModel || opts.model } : null };
    }
    const foundVideo = data?.video_url || data?.url;
    if (foundVideo) return { videoUrl: foundVideo, raw:data, proxy: proxyIndex ? { keyIndex: parseInt(proxyIndex,10), totalKeys: parseInt(proxyTotal||"1",10), model: proxyModel || opts.model } : null };
    const maybeUrl = extractOxyyVideo(data);
    if (maybeUrl) return { videoUrl: maybeUrl, raw:data, proxy: proxyIndex ? { keyIndex: parseInt(proxyIndex,10), totalKeys: parseInt(proxyTotal||"1",10), model: proxyModel || opts.model } : null };
    return { videoUrl: videoUrl || null, raw:data, status, jobId, proxy: proxyIndex ? { keyIndex: parseInt(proxyIndex,10), totalKeys: parseInt(proxyTotal||"1",10), model: proxyModel || opts.model } : null };
  }

  function extractOxyyVideo(data){
    try{
      if (data?.video_url && String(data.video_url).startsWith("http")) return data.video_url;
      if (data?.videoUrl && String(data.videoUrl).startsWith("http")) return data.videoUrl;
      if (data?.data?.video_url && String(data.data.video_url).startsWith("http")) return data.data.video_url;
      if (data?.data?.[0]?.video_url) return data.data[0].video_url;
      if (data?.output?.[0]?.url) return data.output[0].url;
      if (typeof data?.url === "string" && data.url.startsWith("http") && data.url.includes(".mp4")) return data.url;
    }catch{}
    return null;
  }

  async function generateVideoWithFailover(prompt, ref, opts, card, idempotencyKey){
    const ordered = getOrderedKeyIndices();
    let lastError=null; let transientCount=0;
    for(let attempt=0; attempt<ordered.length; attempt++){
      const keyIdx=ordered[attempt];
      busyKey=keyIdx; updateKeyIndicator();
      const sub=card.querySelector(".gen-loader-sub");
      if(attempt>0 && sub){ sub.textContent=`Trying another Oxyy key… (${attempt+1}/${ordered.length})`; sub.animate?.([{opacity:0, transform:"translateY(4px)"},{opacity:1, transform:"none"}],{duration:220,easing:"ease-out"}); }
      if(attempt>0) showToast("Trying another Oxyy key…");
      try{
        const result = await callOxyyVideo(prompt, ref, opts, idempotencyKey);
        if (result.videoUrl){
          keyState[keyIdx].lastSuccess=Date.now(); keyState[keyIdx].failures=0; keyState[keyIdx].cooldownUntil=0; lastSuccessfulKey=keyIdx; busyKey=-1; updateKeyIndicator();
          if(result.proxy) showToast(`Video ready — Key ${result.proxy.keyIndex}/${result.proxy.totalKeys} · ${result.proxy.model}`);
          else showToast("Video ready.");
          return result;
        }
        if (result.jobId){
          const sub2=card.querySelector(".gen-loader-sub");
          if(sub2) sub2.textContent=`Queued · ${opts.model} · polling…`;
          const poll = await pollVideoUntilDone(result.jobId, result.proxy ? result.proxy.keyIndex-1 : keyIdx, opts);
          if(poll.videoUrl){
            keyState[keyIdx].lastSuccess=Date.now(); keyState[keyIdx].failures=0; keyState[keyIdx].cooldownUntil=0; lastSuccessfulKey=keyIdx; busyKey=-1; updateKeyIndicator();
            showToast("Video ready — polling complete.");
            return poll;
          }
          const pollMsg = poll.error || "Video generation failed.";
          const isUpstream = /upstream_error|generation_failed/i.test(poll.error||"") || /Something went wrong/i.test(poll.error||"");
          throw { status: isUpstream ? 502 : 500, message: isUpstream ? `Oxyy video engine failed: ${pollMsg} — try a different prompt or model (Veo/Grok) in a minute. Image still works.` : pollMsg, rawMessage: poll.error, code: isUpstream ? "upstream_error" : "video_failed" };
        }
        throw { status: 502, message:"No video was returned. Try rephrasing or use a different model.", code:"no_video" };
      }catch(e){
        lastError=e;
        const status=e.status||0;
        const isTransient=isTransientError(status, e.code);
        const isAuth=status===401||status===403;
        const isBadRequest=status===400;
        const isUpstream = e.code==="upstream_error" || /upstream_error|generation_failed/i.test(String(e.message||""));
        if (isUpstream){
          keyState[keyIdx].lastFailure=Date.now(); keyState[keyIdx].failures++;
          keyState[keyIdx].cooldownUntil=Date.now()+ 18_000;
          busyKey=-1; updateKeyIndicator();
          const finalUp = { status: 502, message: e.message, code: "upstream_error", rawMessage: e.rawMessage, title: "Oxyy video engine busy" };
          finalizeCardError(card, finalUp);
          throw finalUp;
        }
        keyState[keyIdx].lastFailure=Date.now(); keyState[keyIdx].failures++;
        let cd=null;
        if(e.retryDelay){ const m=String(e.retryDelay).match(/(\d+)/); if(m) cd=(parseInt(m[1],10)*1000)+800; }
        if(isTransient){ transientCount++; const base=cd ?? COOLDOWN[status] ?? (e.code==="network"?COOLDOWN.network:COOLDOWN.generic); keyState[keyIdx].cooldownUntil=Date.now()+base; }
        else if(isAuth||isBadRequest){ keyState[keyIdx].cooldownUntil=Date.now()+(cd ?? 30_000); }
        else { keyState[keyIdx].cooldownUntil=Date.now()+(cd ?? 12_000); }
        busyKey=-1; updateKeyIndicator();
        const isLast=attempt===ordered.length-1;
        if(isBadRequest && !isTransient && attempt>=1) break;
        if(isLast) break;
        if(isTransient||isAuth) await sleep(420+Math.random()*300);
        else if(isBadRequest) await sleep(280);
        else await sleep(350);
      }
    }
    busyKey=-1; updateKeyIndicator();
    const final=normalizeFinalError(lastError, transientCount, ordered.length);
    if (final.code==="upstream_error" || /Something went wrong|upstream/i.test(final.message||"")){
      final.message = final.message.includes("Oxyy video engine") ? final.message : `Oxyy video engine busy: ${final.message} — image generation still works. Try Grok/Veo again in a minute.`;
      final.title = "Oxyy video engine busy";
    }
    finalizeCardError(card, final);
    throw final;
  }

  async function pollVideoUntilDone(jobId, keyIdx, opts){
    const maxWaitMs=600_000;
    const start=Date.now();
    let interval=5000;
    const keyForPoll = KEYS[keyIdx] || KEYS[0];
    while(Date.now()-start < maxWaitMs){
      await new Promise(r=> setTimeout(r, interval));
      try{
        const resp = await fetch(`${BASE_URL}/videos/generations?jobId=${encodeURIComponent(jobId)}`, { headers: {} });
        if(!resp.ok){
          if(resp.status===404) return { error:"Video job not found.", videoUrl:null };
          const txt=await resp.text().catch(()=> "");
          if(resp.status===500 || resp.status===503){ interval=Math.min(interval+1000,8000); continue; }
          return { error: sanitizeApiMessage(txt) || `Poll failed (${resp.status})`, videoUrl:null };
        }
        let data=null;
        try{ data=await resp.json(); }catch{}
        const status=data?.status || data?.state || data?.data?.status || "";
        const videoUrl=data?.video_url || data?.videoUrl || data?.url || data?.data?.video_url || data?.output?.[0]?.url;
        if(status==="completed" || status==="succeeded" || status==="success" || videoUrl){
          if(videoUrl) return { videoUrl, raw:data };
          if(status==="completed") return { videoUrl: videoUrl || null, raw:data };
        }
        if(status==="failed" || status==="error" || status==="cancelled"){
          const err=data?.error?.message || data?.message || "Video generation failed.";
          return { error: sanitizeApiMessage(err), videoUrl:null };
        }
      }catch(e){
        interval=Math.min(interval+1000,8000);
      }
    }
    return { error:"Video generation timed out. Please try again.", videoUrl:null };
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
    const proj = getActiveProject();
    const assets = getFilteredAssets();
    const totalInProject = proj ? proj.assets.length : 0;
    const visibleCount = assets.length;

    if (historyGrid){
      historyGrid.innerHTML = "";
      const shouldShowLegacy = false;
      const displayEmpty = visibleCount===0;
      historyCount.hidden = totalInProject === 0;
      historyCount.textContent = String(totalInProject);
      if (historySubtitle){
        if (proj) historySubtitle.textContent = `${totalInProject} assets · ${proj.name} · local only`;
        else historySubtitle.textContent = "Local only";
      }
      if (displayEmpty) {
        if (historyEmpty){
          historyEmpty.hidden = false;
          historyEmpty.style.display = "";
          const q = projectSearch.trim();
          if (q) historyEmpty.textContent = `No assets match "${q}" in ${proj?proj.name:"project"}.`;
          else if (projectFilter!=="all") historyEmpty.textContent = `No ${projectFilter}s in this project yet.`;
          else historyEmpty.textContent = "No generations yet. Your images and videos will appear here.";
        }
        return;
      }
      if (historyEmpty){ historyEmpty.hidden = true; historyEmpty.style.display = "none"; }

      assets.forEach((item, idx) => {
        const el = document.createElement("div");
        el.className = "history-item" + (item.type==="video" ? " history-item--video" : "");
        el.setAttribute("role", "listitem");
        el.tabIndex = 0;
        el.setAttribute("aria-label", `${item.type==="video" ? "Video" : "Image"}: ${item.prompt.slice(0,60)}`);
        const isVideo = item.type==="video";
        const thumb = isVideo
          ? `<video src="${escapeAttr(item.mediaUrl)}" poster="${escapeAttr(item.poster||"")}" muted loop playsinline preload="metadata" style="width:100%; aspect-ratio:1; object-fit:cover; display:block; background:#0B0B0D"></video><span style="position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:36px; height:36px; border-radius:50%; background:rgba(0,0,0,0.52); backdrop-filter:blur(8px); display:grid; place-items:center; color:#fff; border:0.5px solid rgba(255,255,255,0.14); font-size:14px">▶</span>`
          : `<img src="${escapeAttr(item.mediaUrl)}" alt="${escapeAttr(item.prompt.slice(0,80))}" loading="lazy" style="width:100%; aspect-ratio:1; object-fit:cover; display:block" />`;
        const title = item.title || item.prompt.slice(0,38);
        const tagHtml = (item.tags && item.tags.length) ? `<span class="history-item-time" style="display:flex; gap:4px; flex-wrap:wrap; margin-top:4px">${item.tags.map(t=>`<span class="asset-tag" style="font-size:9.5px; padding:1px 6px">${escapeHtml(t)}</span>`).join("")}</span>` : "";
        el.innerHTML = `
          <div style="position:relative; overflow:hidden; border-radius:14px 14px 0 0">${thumb}</div>
          <div class="history-item-meta" style="position:static; background: linear-gradient(to top, rgba(0,0,0,0.04), transparent); padding:8px 8px 6px; backdrop-filter:none">
            <span class="history-item-prompt" title="${escapeAttr(item.title||item.prompt)}">${escapeHtml(title)}${(item.title||item.prompt).length>38?"…":""}</span>
            <span class="history-item-time">${escapeHtml(formatTime(item.timestamp))} · ${escapeHtml(item.model|| (isVideo?videoModel:IMAGE_MODEL))} · ${escapeHtml(item.aspect||"—")} · ${escapeHtml(item.resolution||"—")}${isVideo && item.duration ? ` · ${item.duration}s` : ""}${isVideo && item.audio ? " · Audio":""}</span>
            ${tagHtml}
            <div style="display:flex; gap:4px; margin-top:6px; flex-wrap:wrap">
              <button class="text-btn" style="height:24px; padding:0 8px; font-size:10.5px" data-action="open" type="button">Open</button>
              <button class="text-btn" style="height:24px; padding:0 8px; font-size:10.5px" data-action="download" type="button">Download</button>
              <button class="text-btn" style="height:24px; padding:0 8px; font-size:10.5px" data-action="rename" type="button">Rename</button>
              <button class="text-btn text-btn--danger" style="height:24px; padding:0 8px; font-size:10.5px" data-action="delete" type="button">Delete</button>
            </div>
          </div>
        `;
        el.querySelector('[data-action="open"]').addEventListener("click", (e)=>{ e.stopPropagation(); openLightbox(item.mediaUrl, item.prompt, item.type); });
        el.querySelector('[data-action="download"]').addEventListener("click", (e)=>{ e.stopPropagation(); const fn=`shilo-${item.type}-${Date.now()}-${(item.aspect||"1x1").replace(":","x")}.${item.type==="video"?"mp4":"png"}`; downloadDataUrl(item.mediaUrl, fn); });
        el.querySelector('[data-action="rename"]').addEventListener("click", (e)=>{
          e.stopPropagation();
          const nv=prompt("Rename asset:", item.title||item.prompt.slice(0,40));
          if(nv!=null){ updateProjectAsset(item.id, { title: nv.trim().slice(0,60) }); }
        });
        el.querySelector('[data-action="delete"]').addEventListener("click", (e)=>{
          e.stopPropagation();
          if(confirm(`Delete this ${item.type}?`)){ deleteAsset(item.id); }
        });
        el.addEventListener("click", () => openLightbox(item.mediaUrl, item.prompt, item.type));
        el.addEventListener("keydown", (e) => { if (e.key==="Enter"||e.key===" ") { e.preventDefault(); openLightbox(item.mediaUrl, item.prompt, item.type); }});
        el.style.animationDelay = `${Math.min(idx*28, 220)}ms`;
        historyGrid.appendChild(el);
      });
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches && assets.length){
        historyCount.animate?.([{transform:"scale(1)"},{transform:"scale(1.08)"},{transform:"scale(1)"}],{duration:340, easing:"cubic-bezier(.22,1,.36,1)"});
        historyGrid.animate?.([{opacity:0.96},{opacity:1}],{duration:220, easing:"ease-out"});
      }
    }
    renderProjectsBar();
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

  function openLightbox(src, caption, kind){
    const isVideo = kind==="video" || (typeof src==="string" && (src.includes(".mp4") || src.startsWith("blob:") && caption && caption.toLowerCase().includes("video")) ) || (src && String(src).startsWith("http") && String(src).includes("video"));
    const detectVideo = kind==="video" || (src && (String(src).endsWith(".mp4") || String(src).includes("video")) && !String(src).startsWith("data:image"));
    const useVideo = kind==="video" ? true : detectVideo ? true : /\.(mp4|webm|mov)(\?|$)/i.test(String(src));
    if (useVideo){
      lightboxImg.hidden = true;
      lightboxImg.removeAttribute("src");
      lightboxVideo.hidden = false;
      lightboxVideo.src = src;
      lightboxVideo.poster = "";
      lightboxVideo.dataset.filename = `shilo-${Date.now()}.mp4`;
      lightboxVideo.load();
    } else {
      lightboxVideo.hidden = true;
      try{ lightboxVideo.pause(); }catch{}
      lightboxVideo.removeAttribute("src");
      lightboxImg.hidden = false;
      lightboxImg.src = src;
      lightboxImg.alt = caption ? `Generated ${useVideo?"video":"image"}: ${caption.slice(0,120)}` : `Generated ${useVideo?"video":"image"}`;
      lightboxImg.dataset.filename = `shilo-${Date.now()}.${useVideo?"mp4":"png"}`;
    }
    lightboxCaption.textContent = caption || "";
    lightbox.classList.add("is-open");
    lightbox.setAttribute("aria-hidden","false");
    document.body.style.overflow = "hidden";
    lightboxClose.focus();
  }
  function closeLightbox(){
    lightbox.classList.remove("is-open");
    lightbox.setAttribute("aria-hidden","true");
    const bothOpen = (historyPanel && historyPanel.classList.contains("is-open")) || (projectsPanel && projectsPanel.classList.contains("is-open"));
    document.body.style.overflow = bothOpen ? "hidden" : "";
    setTimeout(()=> {
      if(!lightbox.classList.contains("is-open")){
        try{ lightboxVideo.pause(); }catch{}
        lightboxImg.removeAttribute("src");
        lightboxVideo.removeAttribute("src");
        lightboxImg.hidden = false;
        lightboxVideo.hidden = true;
      }
    }, 300);
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
    getProjects: () => JSON.parse(JSON.stringify(projects)),
    getActiveProject: () => getActiveProject() ? JSON.parse(JSON.stringify(getActiveProject())) : null,
    getSettings: () => ({ mode, imageModel: IMAGE_MODEL, videoModel, videoDuration, videoResolution, audioEnabled, aspectRatio, resolution, model: MODEL, displayModel: DISPLAY_MODEL, baseUrl: BASE_URL, keysConfigured: KEYS.length, projects: projects.length })
  };
})();
