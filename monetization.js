(() => {
  "use strict";
  const remote = window.XP_REMOTE;
  const client = remote?.client;
  if (!client) return;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money = cents => cents == null ? "Valor não configurado" : (Number(cents)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  const date = value => value ? new Date(value).toLocaleDateString("pt-BR") : "—";
  const statusLabel = {pending:"Em análise",approved:"Aprovado",active:"Ativa",rejected:"Recusado",canceled:"Cancelado",expired:"Expirada"};
  let plans = [], settings = null, selectedPlan = null, ownListings = [];
  const notify = message => window.toast?.(message);
  const currentUser = () => remote.user;
  const requireUser = () => {
    if (!currentUser()) { notify("Entre na sua conta para acessar os planos."); window.page?.("profile"); return false; }
    return true;
  };
  const proofPath = async file => {
    if (!file) throw new Error("Selecione o comprovante do Pix.");
    if (!["image/jpeg","image/png","image/webp","application/pdf"].includes(file.type)) throw new Error("Envie JPG, PNG, WebP ou PDF.");
    if (file.size > 5 * 1024 * 1024) throw new Error("O comprovante deve ter até 5 MB.");
    const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1].replace("jpeg","jpg");
    const path = currentUser().id + "/" + crypto.randomUUID() + "." + ext;
    const {error} = await client.storage.from("allxap-payment-proofs").upload(path,file,{upsert:false,contentType:file.type});
    if (error) throw error;
    return path;
  };
  async function loadPublicData() {
    const [p,s] = await Promise.all([
      client.from("monetization_plans").select("*").eq("is_active",true).order("sort_order").order("name"),
      client.from("monetization_settings").select("*").eq("id",true).maybeSingle()
    ]);
    if (p.error) throw p.error;
    if (s.error) throw s.error;
    plans = p.data || []; settings = s.data || null;
    renderPublicPlans(); renderPixInfo();
  }
  function renderPublicPlans() {
    const host = $("publicPlans"); if (!host) return;
    const available = plans.filter(p => Number(p.monthly_price_cents) > 0);
    host.innerHTML = available.length ? available.map(p => `
      <article class="monetization-plan-card">
       <div class="monetization-plan-card-top"><span class="monetization-plan-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z"/><path d="m4.5 7.8 7.5 4.4 7.5-4.4M12 12.2V21"/></svg></span><span class="monetization-kicker">PLANO MENSAL</span></div><h3>${esc(p.name)}</h3>
       <p>${esc(p.description || "Plano mensal para divulgar seu negócio no AllXap.")}</p>
       <div class="monetization-plan-price">${money(p.monthly_price_cents)} <small>/ mês</small></div>
       <button class="btn" type="button" data-buy-plan="${esc(p.id)}">Escolher plano</button>
      </article>`).join("") : '<div class="monetization-empty">Ainda não há planos mensais disponíveis.</div>';
  }
  function renderPixInfo() {
    const host = $("pixInstructions"); if (!host) return;
    if (!settings?.pix_key) {
      host.innerHTML = '<div class="monetization-inline-heading"><span class="monetization-inline-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 7.5 10.5 4h3L17 7.5l3.5 3.5v2L17 16.5 13.5 20h-3L7 16.5 3.5 13v-2z"/><path d="m9 9 6 6m0-6-6 6"/></svg></span><h3>Pagamento por Pix</h3></div><p>A chave Pix ainda não foi configurada. Assim que estiver disponível, você poderá solicitar seu plano por aqui.</p>';
      return;
    }
    host.innerHTML = '<div class="monetization-inline-heading"><span class="monetization-inline-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 7.5 10.5 4h3L17 7.5l3.5 3.5v2L17 16.5 13.5 20h-3L7 16.5 3.5 13v-2z"/><path d="m9 9 6 6m0-6-6 6"/></svg></span><h3>Dados para pagamento</h3></div><p>'+esc(settings.pix_instructions || "Faça o Pix e envie o comprovante para análise.")+'</p><div class="monetization-pix-key"><code id="allxapPixKey">'+esc(settings.pix_key)+'</code><button class="btn secondary" type="button" id="copyAllxapPix">Copiar chave</button></div><small class="sub">Favorecido: '+esc(settings.pix_receiver_name || "Não informado")+'</small>';
    $("copyAllxapPix")?.addEventListener("click",()=>{navigator.clipboard?.writeText(settings.pix_key).then(()=>notify("Chave Pix copiada.")).catch(()=>notify("Não foi possível copiar a chave."));});
  }
  async function loadMyAccount() {
    if (!currentUser()) {
      $("mySubscription").innerHTML='<p>Entre na sua conta para consultar suas assinaturas e pagamentos.</p>';
      $("myPayments").innerHTML='<div class="monetization-empty">Entre para ver seu histórico de pagamentos.</div>';
      $("featuredPurchase").innerHTML='<div class="monetization-empty">Entre na sua conta para destacar um anúncio.</div>';
      return;
    }
    const uid = currentUser().id;
    const [subs,pays,ads] = await Promise.all([
      client.from("monetization_subscriptions").select("*").eq("user_id",uid).order("created_at",{ascending:false}).limit(10),
      client.from("monetization_payments").select("*").eq("user_id",uid).order("created_at",{ascending:false}).limit(20),
      client.from("listings").select("id,title,status").eq("owner_id",uid).eq("status","published").order("created_at",{ascending:false})
    ]);
    if (subs.error) throw subs.error; if (pays.error) throw pays.error; if (ads.error) throw ads.error;
    const active = (subs.data||[]).find(x=>x.status==="active" && (!x.ends_at || new Date(x.ends_at)>new Date()));
    const activePlan = active && plans.find(p=>p.id===active.plan_id);
    $("mySubscription").innerHTML = active
      ? '<div class="monetization-inline-heading"><span class="monetization-inline-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></span><div><span class="monetization-kicker">ASSINATURA ATIVA</span><h3>Seu plano: '+esc(activePlan?.name || active.plan_id)+'</h3></div></div><p>Ativo até '+date(active.ends_at)+'.</p>'
      : '<div class="monetization-inline-heading"><span class="monetization-inline-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3v18m9-9H3"/></svg></span><div><span class="monetization-kicker">SUA CONTA</span><h3>Você ainda não tem um plano ativo</h3></div></div><p>Escolha um plano mensal ou mantenha seus anúncios gratuitos.</p>';
    $("myPayments").innerHTML = (pays.data||[]).length ? pays.data.map(p=>`
      <div class="monetization-row"><div class="monetization-row-main"><strong><span class="monetization-payment-icon" aria-hidden="true">${p.payment_type==="subscription"?"▣":"✦"}</span>${p.payment_type==="subscription"?"Plano mensal":"Anúncio em destaque"} · ${money(p.amount_cents)}</strong><small>${date(p.created_at)} · ${p.payment_type==="subscription"?"Plano "+esc(p.plan_id):esc(p.duration_days)+" dias"}</small></div><span class="monetization-status ${esc(p.status)}">${statusLabel[p.status]||esc(p.status)}</span></div>`).join("") : '<div class="monetization-empty">Nenhum pagamento enviado ainda.</div>';
    ownListings = ads.data || []; renderFeaturedOptions();
  }
  function renderFeaturedOptions() {
    const host=$("featuredPurchase"); if(!host)return;
    if (!ownListings.length) {host.innerHTML='<div class="monetization-empty">Você não tem anúncios publicados para destacar.</div>';return;}
    const p7=settings?.featured_7d_price_cents, p15=settings?.featured_15d_price_cents;
    host.innerHTML='<div class="field"><label for="featuredListingSelect">Escolha seu anúncio</label><select id="featuredListingSelect">'+ownListings.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.title)+'</option>').join("")+'</select></div><div class="monetization-row"><div class="monetization-row-main"><strong>7 dias</strong><small>Mais visibilidade por uma semana</small></div><strong>'+money(p7)+'</strong><button class="btn secondary" type="button" data-feature-days="7" '+(Number(p7)>0?'':'disabled')+'>Escolher</button></div><div class="monetization-row"><div class="monetization-row-main"><strong>15 dias</strong><small>Mais visibilidade por quinze dias</small></div><strong>'+money(p15)+'</strong><button class="btn secondary" type="button" data-feature-days="15" '+(Number(p15)>0?'':'disabled')+'>Escolher</button></div><div id="featuredFormHost"></div>';
  }
  function renderPlanForm(plan) {
    if (!requireUser()) return;
    if (!settings?.pix_key) {notify("O Pix ainda não foi configurado pela administração.");return;}
    selectedPlan=plan;
    const host=$("moneyPurchaseFormHost");
    host.innerHTML='<form class="monetization-form" id="planPaymentForm"><h3>Solicitar plano '+esc(plan.name)+'</h3><p class="sub">Valor: <strong>'+money(plan.monthly_price_cents)+'</strong> por mês. Faça o Pix para a chave abaixo e anexe o comprovante.</p><div class="monetization-pix-key"><code>'+esc(settings.pix_key)+'</code><button class="btn secondary" type="button" data-copy-pix>Copiar chave</button></div><small class="sub">Favorecido: '+esc(settings.pix_receiver_name||"Não informado")+'</small><div class="field"><label for="planProof">Comprovante do Pix *</label><input id="planProof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required></div><div class="field"><label for="planNote">Observação (opcional)</label><textarea id="planNote" maxlength="500" placeholder="Informações adicionais"></textarea></div><button class="btn" type="submit">Enviar comprovante</button></form>';
    host.scrollIntoView({behavior:"smooth",block:"center"});
  }
  async function submitPlanPayment(event) {
    event.preventDefault(); const button=event.submitter; if(button)button.disabled=true;
    try {
      const path=await proofPath($("planProof")?.files?.[0]);
      const {data:payment,error}=await client.from("monetization_payments").insert({
        user_id:currentUser().id,payment_type:"subscription",plan_id:selectedPlan.id,
        amount_cents:selectedPlan.monthly_price_cents,proof_path:path,payer_note:$("planNote")?.value||""
      }).select("id").single();
      if(error)throw error;
      const {error:subError}=await client.from("monetization_subscriptions").insert({
        user_id:currentUser().id,plan_id:selectedPlan.id,payment_id:payment.id,status:"pending"
      });
      if(subError)console.warn("Solicitação de assinatura ficará vinculada ao pagamento para aprovação:",subError);
      $("moneyPurchaseFormHost").innerHTML="";
      notify("Comprovante enviado. A assinatura será ativada após a conferência.");
      await loadMyAccount();
    } catch(error) {notify(error.message||"Não foi possível enviar o comprovante.");if(button)button.disabled=false;}
  }
  function renderFeaturedForm(days) {
    if (!requireUser()) return;
    if (!settings?.pix_key) {notify("O Pix ainda não foi configurado pela administração.");return;}
    const amount=days===7?settings.featured_7d_price_cents:settings.featured_15d_price_cents;
    const host=$("featuredFormHost");
    host.innerHTML='<form class="monetization-form" id="featuredPaymentForm" data-days="'+days+'" data-amount="'+amount+'"><h3>Destacar por '+days+' dias</h3><p class="sub">Valor: <strong>'+money(amount)+'</strong>. Faça o Pix para a chave abaixo e anexe o comprovante.</p><div class="monetization-pix-key"><code>'+esc(settings.pix_key)+'</code><button class="btn secondary" type="button" data-copy-pix>Copiar chave</button></div><small class="sub">Favorecido: '+esc(settings.pix_receiver_name||"Não informado")+'</small><div class="field"><label for="featuredProof">Comprovante do Pix *</label><input id="featuredProof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required></div><button class="btn" type="submit">Enviar comprovante</button></form>';
    host.scrollIntoView({behavior:"smooth",block:"center"});
  }
  async function submitFeaturedPayment(event) {
    event.preventDefault();const form=event.currentTarget,button=event.submitter;if(button)button.disabled=true;
    try {
      const path=await proofPath($("featuredProof")?.files?.[0]);
      const days=Number(form.dataset.days),amount=Number(form.dataset.amount),listingId=$("featuredListingSelect")?.value;
      const {error}=await client.from("monetization_payments").insert({
        user_id:currentUser().id,payment_type:"featured_listing",listing_id:listingId,
        duration_days:days,amount_cents:amount,proof_path:path
      });
      if(error)throw error;
      $("featuredFormHost").innerHTML="";
      notify("Comprovante enviado. O destaque será ativado após a conferência.");
      await loadMyAccount();
    } catch(error){notify(error.message||"Não foi possível enviar o comprovante.");if(button)button.disabled=false;}
  }
  async function signedProof(path) {
    if(!path)return null;
    const {data,error}=await client.storage.from("allxap-payment-proofs").createSignedUrl(path,300);
    if(error){console.error(error);return null;}return data?.signedUrl||null;
  }
  async function loadAdminPayments() {
    const host=$("moneyAdminPayments");host.innerHTML='<div class="monetization-loading">Carregando pagamentos...</div>';
    const {data,error}=await client.from("monetization_payments").select("*").order("created_at",{ascending:false}).limit(100);
    if(error){host.innerHTML='<div class="monetization-empty">'+esc(error.message)+'</div>';return;}
    if(!data?.length){host.innerHTML='<div class="monetization-empty">Nenhum pagamento recebido.</div>';return;}
    const rows=await Promise.all(data.map(async p=>({p,url:await signedProof(p.proof_path)})));
    host.innerHTML='<h3>Comprovantes recebidos</h3><p class="sub">Aprove somente depois de conferir o valor e o comprovante.</p>'+rows.map(({p,url})=>`
      <div class="monetization-row"><div class="monetization-row-main"><strong>${p.payment_type==="subscription"?"Plano "+esc(p.plan_id):"Destaque de "+esc(p.duration_days)+" dias"} · ${money(p.amount_cents)}</strong><small>Usuário: ${esc(p.user_id)} · ${date(p.created_at)}</small>${url?'<a class="monetization-proof-link" href="'+url+'" target="_blank" rel="noopener">Abrir comprovante</a>':'<small>Comprovante indisponível</small>'}</div><div class="monetization-admin-actions"><span class="monetization-status ${esc(p.status)}">${statusLabel[p.status]||esc(p.status)}</span>${p.status==="pending"?'<button class="btn" type="button" data-approve-payment="'+p.id+'">Aprovar</button><button class="btn secondary" type="button" data-reject-payment="'+p.id+'">Recusar</button>':''}</div></div>`).join("");
  }
  async function loadAdminSubscriptions() {
    const host=$("moneyAdminSubscriptions");host.innerHTML='<div class="monetization-loading">Carregando assinaturas...</div>';
    const {data,error}=await client.from("monetization_subscriptions").select("*").order("created_at",{ascending:false}).limit(150);
    if(error){host.innerHTML='<div class="monetization-empty">'+esc(error.message)+'</div>';return;}
    host.innerHTML='<h3>Assinaturas cadastradas</h3>'+((data||[]).length?data.map(s=>`
      <div class="monetization-row"><div class="monetization-row-main"><strong>${esc(plans.find(p=>p.id===s.plan_id)?.name||s.plan_id)}</strong><small>Usuário: ${esc(s.user_id)} · Início: ${date(s.starts_at)} · Fim: ${date(s.ends_at)}</small></div><div class="monetization-admin-actions"><span class="monetization-status ${esc(s.status)}">${statusLabel[s.status]||esc(s.status)}</span>${s.status==="active"?'<button class="btn secondary" type="button" data-cancel-sub="'+s.id+'">Cancelar</button>':''}</div></div>`).join(""):'<div class="monetization-empty">Nenhuma assinatura registrada.</div>');
  }
  async function loadAdminPlans() {
    const host=$("moneyAdminPlans");const {data,error}=await client.from("monetization_plans").select("*").order("sort_order").order("name");
    if(error){host.innerHTML='<div class="monetization-empty">'+esc(error.message)+'</div>';return;}
    host.innerHTML='<h3>Planos mensais</h3><form class="monetization-admin-form" id="adminPlanForm"><div class="form-grid"><div class="field"><label for="adminPlanName">Nome do plano</label><input id="adminPlanName" maxlength="60" required placeholder="Ex.: Profissional"></div><div class="field"><label for="adminPlanPrice">Preço mensal (R$)</label><input id="adminPlanPrice" inputmode="decimal" required placeholder="0,00"></div></div><div class="field"><label for="adminPlanDescription">Descrição e benefícios</label><textarea id="adminPlanDescription" maxlength="500" placeholder="Descreva o que está incluído"></textarea></div><div class="field"><label for="adminPlanOrder">Ordem de exibição</label><input id="adminPlanOrder" type="number" value="0"></div><label><input id="adminPlanActive" type="checkbox"> Disponibilizar para usuários</label><button class="btn" type="submit">Cadastrar plano</button></form>'+((data||[]).map(p=>`
      <div class="monetization-row"><div class="monetization-row-main"><strong>${esc(p.name)} · ${money(p.monthly_price_cents)}/mês</strong><small>${esc(p.description||"Sem descrição")} · ${p.is_active?"Disponível":"Desativado"}</small></div><div class="monetization-admin-actions"><button class="btn secondary" type="button" data-edit-plan="${esc(p.id)}">Editar</button><button class="btn secondary" type="button" data-toggle-plan="${esc(p.id)}" data-active="${p.is_active}">${p.is_active?"Desativar":"Ativar"}</button></div></div>`).join("")||'<div class="monetization-empty">Cadastre o primeiro plano quando os valores e benefícios estiverem definidos.</div>');
    host.querySelector("#adminPlanForm")?.addEventListener("submit",saveAdminPlan);
    host.querySelectorAll("[data-edit-plan]").forEach(b=>b.addEventListener("click",()=>fillPlanForm((data||[]).find(p=>p.id===b.dataset.editPlan))));
    host.querySelectorAll("[data-toggle-plan]").forEach(b=>b.addEventListener("click",async()=>{const p=(data||[]).find(x=>x.id===b.dataset.togglePlan);if(!p)return;const {error}=await client.from("monetization_plans").update({is_active:!p.is_active}).eq("id",p.id);if(error)return notify(error.message);notify("Plano atualizado.");await refreshAdmin();}));
    window.__allxapMonetizationPlans=data||[];
  }
  function fillPlanForm(p) {
    if(!p)return;
    $("adminPlanName").value=p.name;$("adminPlanPrice").value=(p.monthly_price_cents/100).toFixed(2).replace(".",",");
    $("adminPlanDescription").value=p.description||"";
    $("adminPlanOrder").value=p.sort_order??0;$("adminPlanActive").checked=!!p.is_active;
    $("adminPlanForm").dataset.editId=p.id;$("adminPlanForm").querySelector("button[type=submit]").textContent="Salvar alterações";
    $("adminPlanForm").scrollIntoView({behavior:"smooth",block:"center"});
  }
  async function saveAdminPlan(event) {
    event.preventDefault();const form=event.currentTarget,button=form.querySelector("button[type=submit]");button.disabled=true;
    try {
      const name=$("adminPlanName").value.trim(),price=Number($("adminPlanPrice").value.replace(",","."));
      if(!name||!Number.isFinite(price)||price<=0)throw new Error("Informe um nome e um preço mensal válido.");
      const id=form.dataset.editId||name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
      const payload={id,name,monthly_price_cents:Math.round(price*100),description:$("adminPlanDescription").value.trim(),sort_order:Number($("adminPlanOrder").value)||0,is_active:$("adminPlanActive").checked};
      const {error}=await client.from("monetization_plans").upsert(payload,{onConflict:"id"});
      if(error)throw error;notify("Plano salvo.");await refreshAdmin();
    }catch(error){notify(error.message||"Não foi possível salvar o plano.");}finally{button.disabled=false;}
  }
  async function loadAdminSettings() {
    const host=$("moneyAdminSettings");const {data,error}=await client.from("monetization_settings").select("*").eq("id",true).single();
    if(error){host.innerHTML='<div class="monetization-empty">'+esc(error.message)+'</div>';return;}
    host.innerHTML='<h3>Configurações de recebimento</h3><p class="sub">A chave Pix será exibida aos usuários que solicitarem planos ou destaques.</p><form class="monetization-admin-form" id="adminMoneySettingsForm"><div class="field"><label for="adminPixKey">Chave Pix</label><input id="adminPixKey" maxlength="254" value="'+esc(data.pix_key||'')+'" placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"></div><div class="form-grid"><div class="field"><label for="adminPixType">Tipo da chave</label><select id="adminPixType"><option value="">Não informado</option>'+["cpf","cnpj","email","phone","random"].map(v=>'<option value="'+v+'" '+(data.pix_key_type===v?'selected':'')+'>'+({cpf:"CPF",cnpj:"CNPJ",email:"E-mail",phone:"Telefone",random:"Aleatória"}[v])+'</option>').join("")+'</select></div><div class="field"><label for="adminPixReceiver">Nome do favorecido</label><input id="adminPixReceiver" maxlength="120" value="'+esc(data.pix_receiver_name||'')+'"></div></div><div class="field"><label for="adminPixInstructions">Instruções de pagamento</label><textarea id="adminPixInstructions" maxlength="700">'+esc(data.pix_instructions||'')+'</textarea></div><h3>Preços de anúncios em destaque</h3><div class="monetization-settings-grid"><div class="field"><label for="adminFeatured7">Destaque por 7 dias (R$)</label><input id="adminFeatured7" inputmode="decimal" value="'+(data.featured_7d_price_cents==null?'':(data.featured_7d_price_cents/100).toFixed(2).replace(".",","))+'"></div><div class="field"><label for="adminFeatured15">Destaque por 15 dias (R$)</label><input id="adminFeatured15" inputmode="decimal" value="'+(data.featured_15d_price_cents==null?'':(data.featured_15d_price_cents/100).toFixed(2).replace(".",","))+'"></div></div><button class="btn" type="submit">Salvar configurações</button></form>';
    $("adminMoneySettingsForm")?.addEventListener("submit",saveAdminSettings);
  }
  async function saveAdminSettings(event) {
    event.preventDefault();const button=event.submitter;if(button)button.disabled=true;
    try {
      const parsePrice=id=>{const v=$(id).value.trim();if(!v)return null;const n=Number(v.replace(",", "."));if(!Number.isFinite(n)||n<=0)throw new Error("Informe preços válidos ou deixe o campo vazio.");return Math.round(n*100);};
      const payload={pix_key:$("adminPixKey").value.trim()||null,pix_key_type:$("adminPixType").value||null,pix_receiver_name:$("adminPixReceiver").value.trim()||null,pix_instructions:$("adminPixInstructions").value.trim(),featured_7d_price_cents:parsePrice("adminFeatured7"),featured_15d_price_cents:parsePrice("adminFeatured15"),updated_at:new Date().toISOString()};
      const {error}=await client.from("monetization_settings").update(payload).eq("id",true);
      if(error)throw error;notify("Configurações de pagamento salvas.");await loadPublicData();
    }catch(error){notify(error.message||"Falha ao salvar configurações.");}finally{if(button)button.disabled=false;}
  }
  async function refreshAdmin() {
    if(!remote.isAdmin)return;
    await loadPublicData();
    await Promise.all([loadAdminPayments(),loadAdminSubscriptions(),loadAdminPlans(),loadAdminSettings()]);
  }
  async function approvePayment(id) {
    const note=prompt("Observação da aprovação (opcional):")||"";
    const {error}=await client.rpc("approve_allxap_monetization_payment",{p_payment_id:id,p_admin_note:note});
    if(error){notify(error.message||"Não foi possível aprovar.");return;}
    notify("Pagamento aprovado e benefício ativado.");await refreshAdmin();
  }
  async function rejectPayment(id) {
    const note=prompt("Motivo da recusa:")||"";
    if(!note.trim())return notify("Informe o motivo da recusa.");
    const {error}=await client.from("monetization_payments").update({status:"rejected",reviewed_by:currentUser().id,reviewed_at:new Date().toISOString(),admin_note:note.slice(0,1000)}).eq("id",id).eq("status","pending");
    if(error){notify(error.message);return;}
    await client.from("monetization_subscriptions").update({status:"rejected",updated_at:new Date().toISOString()}).eq("payment_id",id).eq("status","pending");
    notify("Pagamento recusado.");await refreshAdmin();
  }
  async function cancelSubscription(id) {
    if(!confirm("Cancelar esta assinatura?"))return;
    const {error}=await client.from("monetization_subscriptions").update({status:"canceled",updated_at:new Date().toISOString()}).eq("id",id).eq("status","active");
    if(error){notify(error.message);return;}notify("Assinatura cancelada.");await refreshAdmin();
  }
  function setAdminTab(tab) {
    document.querySelectorAll("[data-money-tab]").forEach(b=>b.classList.toggle("active",b.dataset.moneyTab===tab));
    ["payments","subscriptions","plans","settings"].forEach(key=>{const el=$("moneyAdmin"+key[0].toUpperCase()+key.slice(1));if(el)el.hidden=key!==tab;});
    if(tab==="payments")loadAdminPayments();if(tab==="subscriptions")loadAdminSubscriptions();if(tab==="plans")loadAdminPlans();if(tab==="settings")loadAdminSettings();
  }
  async function openPlans() {
    if(!requireUser())return;
    try { await loadPublicData(); await loadMyAccount(); }
    catch(error){console.error("AllXap monetization:",error);notify("Não foi possível carregar os planos: "+(error.message||"erro"));}
  }
  document.addEventListener("click",event=>{
    const copyPix=event.target.closest("[data-copy-pix]");if(copyPix){navigator.clipboard?.writeText(settings?.pix_key||"").then(()=>notify("Chave Pix copiada.")).catch(()=>notify("Não foi possível copiar a chave."));return;}
    const account=event.target.closest('[data-account-action="plans"]');
    if(account){window.page?.("plans");openPlans();return;}
    const planButton=event.target.closest("[data-buy-plan]");
    if(planButton){const plan=plans.find(p=>p.id===planButton.dataset.buyPlan);if(plan)renderPlanForm(plan);return;}
    const featureButton=event.target.closest("[data-feature-days]");
    if(featureButton){renderFeaturedForm(Number(featureButton.dataset.featureDays));return;}
    const approve=event.target.closest("[data-approve-payment]");if(approve){approvePayment(approve.dataset.approvePayment);return;}
    const reject=event.target.closest("[data-reject-payment]");if(reject){rejectPayment(reject.dataset.rejectPayment);return;}
    const cancel=event.target.closest("[data-cancel-sub]");if(cancel){cancelSubscription(cancel.dataset.cancelSub);return;}
  });
  document.addEventListener("submit",event=>{
    if(event.target.id==="planPaymentForm")submitPlanPayment(event);
    if(event.target.id==="featuredPaymentForm")submitFeaturedPayment(event);
  });
  document.querySelectorAll("[data-money-tab]").forEach(b=>b.addEventListener("click",()=>setAdminTab(b.dataset.moneyTab)));
  const originalAdminOpen=window.NEXAP_ADMIN?.open;
  const combinedAdminOpen=async()=>{if(typeof originalAdminOpen==="function")await originalAdminOpen();if(remote.isAdmin)await refreshAdmin();};
  window.NEXAP_ADMIN={...(window.NEXAP_ADMIN||{}),open:combinedAdminOpen};
  window.AllXap_ADMIN=window.NEXAP_ADMIN;
  const authSubscription=client.auth.onAuthStateChange((_event,session)=>{
    remote.user=session?.user||null;
    if($("plans")?.classList.contains("active"))openPlans();
  });
  window.addEventListener("beforeunload",()=>authSubscription?.data?.subscription?.unsubscribe?.());
  if(currentUser())loadPublicData().catch(error=>console.error("AllXap monetization:",error));
})();