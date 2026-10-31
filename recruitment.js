/* NEXAP — módulo de empregos e candidaturas */
(() => {
  const remote = window.XP_REMOTE;
  if (!remote?.client) return;
  const db = remote.client;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const toast = message => {
    const node = $("toast");
    if (node) { node.textContent = message; node.style.display = "block"; clearTimeout(window._toastTimer); window._toastTimer = setTimeout(() => node.style.display = "none", 3000); }
  };
  const categoryIsJobs = value => String(value || "").trim().toLowerCase() === "empregos";
  const statusLabels = {received:"Recebida",reviewing:"Em análise",selected:"Selecionada/contratada",rejected:"Não selecionada"};
  let activeListing = null;

  function addJobFields() {
    const category = $("category"), form = $("publishForm");
    if (!category || !form || $("jobVacanciesField")) return;
    const field = document.createElement("div");
    field.id = "jobVacanciesField";
    field.className = "field";
    field.hidden = true;
    field.innerHTML = '<label for="jobVacancies">Quantidade de vagas *</label><input id="jobVacancies" type="number" min="1" max="500" step="1" inputmode="numeric" placeholder="Ex.: 3"><small class="sub">Informe quantas pessoas pretende contratar.</small><div class="field"><label for="jobDeadline">Prazo para candidaturas (opcional)</label><input id="jobDeadline" type="date"></div>';
    const submit = $("publishSubmit");
    form.insertBefore(field, submit);
    const update = () => {
      const visible = categoryIsJobs(category.value);
      field.hidden = !visible;
      $("jobVacancies").required = visible;
    };
    category.addEventListener("change", update);
    update();
    form.addEventListener("submit", event => {
      if (categoryIsJobs(category.value)) {
        const count = Number($("jobVacancies").value);
        if (!Number.isInteger(count) || count < 1 || count > 500) {
          event.preventDefault(); event.stopImmediatePropagation();
          toast("Informe uma quantidade de vagas entre 1 e 500.");
        }
      }
    }, true);
  }

  function addDetailActions() {
    const context = window.NEXAP_LISTING_CONTEXT;
    const host = $("listingPageContent");
    if (!context || !host || !host.querySelector(".listing-detail-actions")) return;
    if (!categoryIsJobs(context.category)) return;
    const actions = host.querySelector(".listing-detail-actions");
    if (actions.dataset.recruitmentEnhanced === "true") return;
    actions.dataset.recruitmentEnhanced = "true";
    const left = context.vacanciesTotal == null ? null : Math.max(0, context.vacanciesTotal - (context.vacanciesFilled || 0));
    if (left !== null) {
      const availability = document.createElement("div");
      availability.className = "notice";
      availability.innerHTML = '<strong>' + left + ' de ' + context.vacanciesTotal + ' vaga(s) disponível(is)</strong>' +
        (context.applicationDeadline ? '<br>Prazo: ' + new Date(context.applicationDeadline + "T12:00:00").toLocaleDateString("pt-BR") : "");
      actions.prepend(availability);
    }
    if (!remote.user) {
      actions.insertAdjacentHTML("afterbegin", '<div class="notice">Entre na sua conta para se candidatar a esta vaga.</div>');
      return;
    }
    if (context.ownerId === remote.user.id) {
      actions.insertAdjacentHTML("afterbegin", '<button class="btn secondary" id="manageJobApplications" type="button">Ver candidaturas</button>');
      return;
    }
    if (left === 0) {
      actions.insertAdjacentHTML("afterbegin", '<div class="notice">Esta vaga já foi preenchida.</div>');
      return;
    }
    actions.insertAdjacentHTML("afterbegin", '<button class="btn" id="applyJobButton" type="button">Candidatar-se</button>');
    checkExistingApplication(context.id);
  }

  async function checkExistingApplication(listingId) {
    const button = $("applyJobButton");
    if (!button || !remote.user) return;
    const {data,error} = await db.from("job_applications").select("id,status").eq("listing_id",listingId).eq("candidate_id",remote.user.id).maybeSingle();
    if (error) { if (error.code !== "42P01") console.warn("NEXAP candidaturas:",error); return; }
    if (data && $("applyJobButton")) {
      $("applyJobButton").disabled = true;
      $("applyJobButton").textContent = "Candidatura enviada · " + (statusLabels[data.status] || data.status);
    }
  }

  function showApplicationForm(context) {
    const profile = remote.profile || {};
    const user = remote.user || {};
    const modal = $("detailModal"), content = $("detailContent");
    if (!modal || !content) return;
    content.innerHTML = '<div class="dialog-head"><h2>Enviar candidatura</h2><button class="close" id="closeModal" type="button" aria-label="Fechar">×</button></div>' +
      '<p class="sub">Apresente suas qualificações ao responsável pela vaga.</p>' +
      '<form id="jobApplicationForm" data-listing-id="' + esc(context.id) + '">' +
      '<div class="field"><label>Nome completo</label><input value="' + esc(profile.display_name || user.user_metadata?.full_name || "") + '" readonly></div>' +
      '<div class="field"><label for="applicationBio">Sobre você / seu perfil</label><textarea id="applicationBio" maxlength="1200" placeholder="Fale brevemente sobre você, suas habilidades e seus objetivos.">' + esc(profile.bio || "") + '</textarea></div>' +
      '<div class="field"><label for="applicationExperience">Experiência profissional</label><textarea id="applicationExperience" maxlength="1600" placeholder="Experiências anteriores, trabalhos informais, projetos ou atividades relevantes."></textarea></div>' +
      '<div class="field"><label for="applicationEducation">Formação e cursos</label><textarea id="applicationEducation" maxlength="800" placeholder="Escolaridade, cursos e qualificações."></textarea></div>' +
      '<div class="field"><label for="applicationWhy">Por que devemos contratar você? *</label><textarea id="applicationWhy" minlength="20" maxlength="1600" required placeholder="Explique como suas habilidades e seu jeito de trabalhar podem contribuir para a empresa."></textarea></div>' +
      '<h3>Formas de contato</h3><p class="sub">Essas informações serão compartilhadas com o anunciante desta vaga.</p>' +
      '<div class="field"><label for="applicationWhatsapp">WhatsApp *</label><input id="applicationWhatsapp" type="tel" inputmode="tel" autocomplete="tel" required placeholder="(68) 99999-9999"></div>' +
      '<div class="field"><label for="applicationPhone">Outro telefone (opcional)</label><input id="applicationPhone" type="tel" inputmode="tel" placeholder="(68) 3333-3333"></div>' +
      '<div class="field"><label for="applicationEmail">E-mail para contato *</label><input id="applicationEmail" type="email" required value="' + esc(user.email || "") + '" placeholder="seuemail@exemplo.com"></div>' +
      '<div class="notice">Ao enviar, você autoriza o compartilhamento destas informações e da sua candidatura com o anunciante responsável por esta vaga.</div>' +
      '<button class="btn" type="submit" style="width:100%;margin-top:14px">Enviar candidatura</button></form>';
    modal.classList.add("open");
  }

  async function submitApplication(form) {
    const context = window.NEXAP_LISTING_CONTEXT;
    if (!remote.user || !context || context.id !== form.dataset.listingId) return toast("Não foi possível identificar a vaga.");
    const whatsapp = $("applicationWhatsapp").value.trim();
    const digits = whatsapp.replace(/\D/g,"");
    if (digits.length < 10 || digits.length > 13) return toast("Informe um WhatsApp válido com DDD.");
    const payload = {
      listing_id:context.id, candidate_id:remote.user.id,
      candidate_name:remote.profile?.display_name || remote.user.user_metadata?.full_name || remote.user.email?.split("@")[0] || "Candidato",
      candidate_bio:$("applicationBio").value.trim(),
      experience:$("applicationExperience").value.trim(),
      education:$("applicationEducation").value.trim(),
      why_hire:$("applicationWhy").value.trim(),
      whatsapp, phone:$("applicationPhone").value.trim(),
      contact_email:$("applicationEmail").value.trim()
    };
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true; button.textContent = "Enviando...";
    const {error} = await db.from("job_applications").insert(payload);
    if (error) {
      button.disabled = false; button.textContent = "Enviar candidatura";
      toast(error.code === "23505" ? "Você já se candidatou a esta vaga." : error.message || "Não foi possível enviar a candidatura.");
      return;
    }
    $("detailModal").classList.remove("open");
    toast("Candidatura enviada com sucesso.");
    const apply = $("applyJobButton");
    if (apply) { apply.disabled = true; apply.textContent = "Candidatura enviada"; }
  }

  async function manageApplications(listingId) {
    const context = window.NEXAP_LISTING_CONTEXT;
    if (!context || context.id !== listingId || context.ownerId !== remote.user?.id) return;
    const content = $("detailContent"), modal = $("detailModal");
    content.innerHTML = '<div class="dialog-head"><h2>Candidaturas recebidas</h2><button class="close" id="closeModal" type="button">×</button></div><div class="sub">Carregando candidatos...</div>';
    modal.classList.add("open");
    const {data,error} = await db.from("job_applications").select("*").eq("listing_id",listingId).order("created_at",{ascending:false});
    if (error) { content.insertAdjacentHTML("beforeend",'<div class="notice">' + esc(error.message) + '</div>'); return; }
    if (!data?.length) { content.insertAdjacentHTML("beforeend",'<div class="empty">Ainda não há candidaturas para esta vaga.</div>'); return; }
    content.insertAdjacentHTML("beforeend",data.map(app => {
      const wa = app.whatsapp.replace(/\D/g,"").replace(/^55/,"");
      const waLink = 'https://wa.me/55' + wa + '?text=' + encodeURIComponent("Olá, " + app.candidate_name + "! Recebemos sua candidatura à vaga " + context.title + " no NEXAP.");
      return '<article class="panel job-candidate"><div class="dialog-head"><strong>' + esc(app.candidate_name) + '</strong><span class="tag">' + esc(statusLabels[app.status] || app.status) + '</span></div>' +
        '<p class="sub">Candidatura em ' + new Date(app.created_at).toLocaleString("pt-BR") + '</p>' +
        (app.candidate_bio ? '<p><strong>Sobre:</strong> ' + esc(app.candidate_bio) + '</p>' : '') +
        (app.experience ? '<p><strong>Experiência:</strong> ' + esc(app.experience) + '</p>' : '') +
        (app.education ? '<p><strong>Formação:</strong> ' + esc(app.education) + '</p>' : '') +
        '<p><strong>Por que contratar:</strong> ' + esc(app.why_hire) + '</p>' +
        '<p><strong>WhatsApp:</strong> ' + esc(app.whatsapp) + '<br><strong>Telefone:</strong> ' + esc(app.phone || "Não informado") + '<br><strong>E-mail:</strong> ' + esc(app.contact_email) + '</p>' +
        '<a class="btn" style="width:100%;text-decoration:none" target="_blank" rel="noopener" href="' + esc(waLink) + '">Conversar pelo WhatsApp</a>' +
        '<div class="field"><label for="applicationStatus-' + app.id + '">Status</label><select id="applicationStatus-' + app.id + '" data-application-status="' + app.id + '"><option value="received" ' + (app.status==="received"?"selected":"") + '>Recebida</option><option value="reviewing" ' + (app.status==="reviewing"?"selected":"") + '>Em análise</option><option value="selected" ' + (app.status==="selected"?"selected":"") + '>Selecionada / contratada</option><option value="rejected" ' + (app.status==="rejected"?"selected":"") + '>Não selecionada</option></select></div></article>';
    }).join(""));
    const total = context.vacanciesTotal || 0, filled = context.vacanciesFilled || 0;
    content.insertAdjacentHTML("beforeend",'<div class="notice"><strong>Vagas preenchidas: ' + filled + ' / ' + total + '</strong><br>Ao marcar alguém como selecionado/contratado, a quantidade de vagas preenchidas é atualizada automaticamente.</div>');
  }

  document.addEventListener("click", event => {
    if (event.target.closest("#applyJobButton")) showApplicationForm(window.NEXAP_LISTING_CONTEXT);
    if (event.target.closest("#manageJobApplications")) manageApplications(window.NEXAP_LISTING_CONTEXT?.id);
  });
  document.addEventListener("submit", event => {
    if (event.target.id === "jobApplicationForm") { event.preventDefault(); submitApplication(event.target); }
  });
  document.addEventListener("change", async event => {
    const select = event.target.closest("[data-application-status]");
    if (!select) return;
    select.disabled = true;
    const {error} = await db.from("job_applications").update({status:select.value}).eq("id",select.dataset.applicationStatus);
    if (error) { toast(error.message || "Não foi possível atualizar o status."); select.disabled=false; return; }
    toast("Status atualizado e vagas sincronizadas.");
  });

  const category = $("category");
  if (category) addJobFields();
  const observer = new MutationObserver(() => addDetailActions());
  const host = $("listingPageContent");
  if (host) observer.observe(host,{childList:true,subtree:true});
  console.info("NEXAP empregos: módulo carregado.");
})();