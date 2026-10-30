
(() => {
  const URL = "https://balojriovbjzywjrvpyw.supabase.co";
  const KEY = "sb_publishable_MLTvK0L_sYVYgnW5SZXfWQ_ISAFHo22";
  const client = window.supabase.createClient(URL, KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const el = id => document.getElementById(id);
  window.XP_REMOTE = { client, user: null, cityId: null, categories: {}, profile: null };
  let profileSetupOpen = false;

  async function readProfile(userId, single = false) {
    let result = await client.from("profiles")
      .select("id,display_name,account_type,bio,city_id,avatar_url")
      .eq("id", userId);
    result = single ? await result.single() : await result.maybeSingle();
    if (result.error && (result.error.code === "42703" || /avatar_url.*does not exist|column.*avatar_url/i.test(result.error.message || ""))) {
      let fallback = await client.from("profiles")
        .select("id,display_name,account_type,bio,city_id")
        .eq("id", userId);
      fallback = single ? await fallback.single() : await fallback.maybeSingle();
      if (fallback.error) throw fallback.error;
      return { ...fallback, data: fallback.data ? { ...fallback.data, avatar_url: null } : null, avatarColumnAvailable: false };
    }
    if (result.error) throw result.error;
    return { ...result, avatarColumnAvailable: true };
  }

  // Evita duas inicializações simultâneas quando a sessão é restaurada
  // e o evento de autenticação dispara quase ao mesmo tempo.
  const profileLoads = new Map();
  async function ensureProfile(user) {
    if (profileLoads.has(user.id)) return profileLoads.get(user.id);
    const task = (async () => {
      const { data: existing } = await readProfile(user.id);
      if (!existing) {
        const displayName = (user.user_metadata?.display_name || user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "Usuário").slice(0, 60);
        // Upsert torna a criação segura caso outra atualização da sessão
        // tente criar o mesmo perfil ao mesmo tempo.
        const { error: upsertError } = await client.from("profiles").upsert({
          id: user.id,
          display_name: displayName,
          city_id: window.XP_REMOTE.cityId
        }, { onConflict: "id", ignoreDuplicates: true });
        if (upsertError) throw upsertError;
      } else if (!existing.city_id && window.XP_REMOTE.cityId) {
        const { error: cityError } = await client.from("profiles")
          .update({ city_id: window.XP_REMOTE.cityId }).eq("id", user.id);
        if (cityError) throw cityError;
      }
      const { data, avatarColumnAvailable } = await readProfile(user.id, true);
      if (!data) throw new Error("O perfil não foi encontrado após a inicialização. Verifique as permissões da tabela profiles no Supabase.");
      window.XP_REMOTE.profile = data;
      window.XP_REMOTE.avatarColumnAvailable = avatarColumnAvailable;
      if (!data.bio?.trim()) openProfileSetup(data, false);
      else updateProfileSummary(data);
      return data;
    })();
    profileLoads.set(user.id, task);
    try {
      return await task;
    } finally {
      profileLoads.delete(user.id);
    }
  }

  function updateProfileSummary(profile) {
    const summary = el("profileSummary");
    if (!summary) return;
    const types = { person: "Pessoa física", professional: "Profissional", business: "Comércio / empresa" };
    summary.textContent = profile.display_name + " • " + (types[profile.account_type] || "Pessoa física") + (profile.bio ? "\n" + profile.bio : "");
    summary.style.whiteSpace = "pre-line";
    const avatar = el("accountAvatar");
    const preview = el("profilePhotoPreview");
    const initials = (profile.display_name || "U").trim()[0]?.toUpperCase() || "U";
    [avatar, preview].forEach(target => { if (!target) return; target.innerHTML = profile.avatar_url ? `<img src="${esc(profile.avatar_url)}" alt="Foto de perfil">` : initials; });
  }

  function openProfileSetup(profile = {}, editing = true) {
    if (profileSetupOpen) return;
    profileSetupOpen = true;
    el("profileSetupTitle").textContent = editing ? "Editar suas informações" : "Complete seu perfil";
    el("profileDisplayName").value = profile.display_name || "";
    el("profileAccountType").value = profile.account_type || "person";
    el("profileBio").value = profile.bio || "";
    const preview = el("profilePhotoPreview");
    const initials = (profile.display_name || "U").trim()[0]?.toUpperCase() || "U";
    preview.innerHTML = profile.avatar_url ? `<img src="${esc(profile.avatar_url)}" alt="Prévia da foto">` : initials;
    el("profilePhotoInput").value = "";
    el("removeProfilePhoto").dataset.remove = "false";
    el("profileSetupModal").classList.add("open");
  }

  let selectedProfilePhoto = null;
  el("profilePhotoInput").addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size > 3 * 1024 * 1024) {
      toast("Escolha uma imagem JPG, PNG ou WebP de até 3 MB.");
      event.target.value = "";
      return;
    }
    selectedProfilePhoto = file;
    el("profilePhotoPreview").innerHTML = "";
    const image = document.createElement("img");
    image.alt = "Prévia da foto de perfil";
    image.src = URL.createObjectURL(file);
    el("profilePhotoPreview").appendChild(image);
    el("removeProfilePhoto").dataset.remove = "false";
  });
  el("removeProfilePhoto").addEventListener("click", () => {
    selectedProfilePhoto = null;
    el("profilePhotoInput").value = "";
    el("profilePhotoPreview").textContent = (el("profileDisplayName").value.trim()[0] || "U").toUpperCase();
    el("removeProfilePhoto").dataset.remove = "true";
  });

  el("profileSetupForm").addEventListener("submit", async event => {
    event.preventDefault();
    const user = window.XP_REMOTE.user;
    if (!user) return;
    const button = el("saveProfileBtn");
    button.disabled = true;
    button.textContent = "Salvando...";
    try {
      const profile = {
        display_name: el("profileDisplayName").value.trim(),
        account_type: el("profileAccountType").value,
        bio: el("profileBio").value.trim(),
        city_id: window.XP_REMOTE.cityId
      };
      if (profile.display_name.length < 2 || profile.bio.length < 10) {
        toast("Informe seu nome e uma descrição com pelo menos 10 caracteres.");
        return;
      }
      if (selectedProfilePhoto) {
        const extension = selectedProfilePhoto.type === "image/png" ? "png" : selectedProfilePhoto.type === "image/webp" ? "webp" : "jpg";
        const path = user.id + "/avatar." + extension;
        const { error: uploadError } = await client.storage.from("profile-avatars").upload(path, selectedProfilePhoto, { upsert: true, contentType: selectedProfilePhoto.type, cacheControl: "3600" });
        if (uploadError) throw uploadError;
        const { data: publicUrl } = client.storage.from("profile-avatars").getPublicUrl(path);
        profile.avatar_url = publicUrl.publicUrl + "?v=" + Date.now();
      } else if (el("removeProfilePhoto").dataset.remove === "true") {
        profile.avatar_url = null;
      }
      if (Object.prototype.hasOwnProperty.call(profile, "avatar_url") && window.XP_REMOTE.avatarColumnAvailable === false) {
        delete profile.avatar_url;
        if (selectedProfilePhoto || el("removeProfilePhoto").dataset.remove === "true") {
          toast("Os dados serão salvos, mas a foto precisa da configuração de armazenamento do Supabase.");
        }
      }
      // UPDATE sem SELECT pode retornar sucesso mesmo quando nenhuma linha foi alterada.
      // Confirma a gravação e cria o registro caso ele esteja ausente.
      let savedResult = await client.from("profiles")
        .update(profile)
        .eq("id", user.id)
        .select("id,display_name,account_type,bio,city_id,avatar_url")
        .maybeSingle();

      if (savedResult.error && (savedResult.error.code === "42703" || /avatar_url.*does not exist|column.*avatar_url/i.test(savedResult.error.message || ""))) {
        const fallbackProfile = { ...profile };
        delete fallbackProfile.avatar_url;
        savedResult = await client.from("profiles")
          .update(fallbackProfile)
          .eq("id", user.id)
          .select("id,display_name,account_type,bio,city_id")
          .maybeSingle();
      }
      if (savedResult.error) throw savedResult.error;

      if (!savedResult.data) {
        const rowToSave = { ...profile, id: user.id };
        let insertResult = await client.from("profiles")
          .upsert(rowToSave, { onConflict: "id" })
          .select("id,display_name,account_type,bio,city_id,avatar_url")
          .single();
        if (insertResult.error && (insertResult.error.code === "42703" || /avatar_url.*does not exist|column.*avatar_url/i.test(insertResult.error.message || ""))) {
          delete rowToSave.avatar_url;
          insertResult = await client.from("profiles")
            .upsert(rowToSave, { onConflict: "id" })
            .select("id,display_name,account_type,bio,city_id")
            .single();
        }
        if (insertResult.error) throw insertResult.error;
        savedResult = insertResult;
      }

      window.XP_REMOTE.profile = savedResult.data;
      updateProfileSummary(window.XP_REMOTE.profile);
      el("profileSetupModal").classList.remove("open");
      profileSetupOpen = false;
      selectedProfilePhoto = null;
      updateProfileSummary(window.XP_REMOTE.profile);
      toast("Informações do perfil salvas.");
    } catch (error) {
      showError(error);
    } finally {
      button.disabled = false;
      button.textContent = "Salvar e continuar";
    }
  });

  // Fechamento confiável do painel de opções e das janelas de conta.
  document.addEventListener("click", event => {
    const closeButton = event.target.closest("#closeModal");
    if (closeButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      el("detailModal").classList.remove("open");
      el("detailContent").innerHTML = "";
      return;
    }
  }, true);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      el("detailModal")?.classList.remove("open");
      el("moreMenu")?.classList.remove("open");
      el("moreMenu")?.setAttribute("aria-hidden", "true");
      el("moreMenuTrigger")?.setAttribute("aria-expanded", "false");
      el("profileSetupModal")?.classList.remove("open");
      profileSetupOpen = false;
    }
  });
  document.addEventListener("click", event => {
    if (event.target.id === "detailModal") {
      el("detailModal").classList.remove("open");
      el("detailContent").innerHTML = "";
    }
  });
  let favoriteIds = new Set();
  const actionModal = () => el("detailModal");
  function showAccountAction(title, body) {
    el("detailContent").innerHTML = '<h2 style="font-size:20px;margin:12px 0">' + title + '</h2>' + body;
    actionModal().classList.add("open");
  }
  async function openFavorites() {
    const user = window.XP_REMOTE.user;
    if (!user) return toast("Entre na sua conta para ver seus favoritos.");
    try {
      const { data, error } = await client.from("favorites").select("listing_id").eq("user_id", user.id);
      if (error) throw error;
      favoriteIds = new Set((data || []).map(row => row.listing_id));
      if (!favoriteIds.size) {
        showAccountAction("Meus favoritos", '<div class="empty">Você ainda não salvou anúncios.<br>Abra um anúncio e toque em “Salvar nos favoritos”.</div>');
        return;
      }
      const { data: rows, error: listingError } = await client.from("listings")
        .select("id,title,description,price,price_label,contact_phone,status,created_at,categories(name),cities(name)")
        .in("id", [...favoriteIds]).eq("status", "published");
      if (listingError) throw listingError;
      const items = (rows || []).map(a => ({
        id:a.id,title:a.title,description:a.description,category:a.categories?.name || "Classificados",
        price:a.price_label || (a.price != null ? "R$ " + Number(a.price).toLocaleString("pt-BR",{minimumFractionDigits:2}) : ""),
        contact:a.contact_phone || "",author:"Usuário XP WORK",city:a.cities?.name || "Xapuri",
        createdAt:new Date(a.created_at).getTime(),owner:"remote"
      }));
      const content = items.length ? items.map(a => '<div class="panel" style="margin:10px 0"><strong>'+esc(a.title)+'</strong><p class="sub">'+esc(a.category)+' • '+money(a.price)+'</p><button class="btn secondary detail" data-id="'+esc(a.id)+'">Ver anúncio</button></div>').join("") : '<div class="empty">Os anúncios salvos não estão mais disponíveis.</div>';
      showAccountAction("Meus favoritos", content);
    } catch (error) { showError(error); }
  }
  document.addEventListener("click", async event => {

  async function openPublicProfile(userId) {
    if (!window.XP_REMOTE.user) return toast("Entre na sua conta para consultar perfis.");
    try {
      const { data: profile, error: profileError } = await client.from("profiles")
        .select("id,display_name,account_type,bio,created_at").eq("id", userId).maybeSingle();
      if (profileError) throw profileError;
      if (!profile) return toast("Este perfil não está disponível.");
      const { data: rows, error: listingError } = await client.from("listings")
        .select("id,title,description,price,price_label,created_at,categories(name)")
        .eq("owner_id", userId).eq("status", "published")
        .order("created_at", {ascending:false}).limit(8);
      if (listingError) throw listingError;
      const types = {person:"Pessoa física",professional:"Profissional",business:"Comércio / empresa"};
      const ads = (rows||[]).map(a => '<div class="profile-ad"><strong>'+esc(a.title)+'</strong><span>'+esc(a.categories?.name||"Classificados")+' · '+money(a.price_label || (a.price!=null?"R$ "+Number(a.price).toLocaleString("pt-BR",{minimumFractionDigits:2}):""))+'</span><span class="profile-ad-open">Anúncio publicado</span></div>').join("");
      showAccountAction("Perfil do anunciante", '<div class="public-profile"><div class="public-profile-avatar">'+esc((profile.display_name||"U").trim().charAt(0).toUpperCase())+'</div><h3>'+esc(profile.display_name||"Usuário NEXAP")+'</h3><span>'+esc(types[profile.account_type]||"Pessoa física")+'</span><p>'+esc(profile.bio||"Este usuário ainda não adicionou uma descrição.")+'</p><div class="account-group-title">ANÚNCIOS PUBLICADOS</div>'+(ads||'<div class="empty">Nenhum anúncio publicado no momento.</div>')+'</div>');
    } catch(error) { showError(error); }
  }

  function openReportForm(listingId) {
    if (!window.XP_REMOTE.user) return toast("Entre na sua conta para denunciar um anúncio.");
    showAccountAction("Denunciar anúncio", '<p class="sub">A denúncia será enviada para análise. Use este recurso apenas para sinalizar problemas reais.</p><form id="listingReportForm" data-listing-id="'+esc(listingId)+'"><div class="field"><label for="reportReason">Motivo da denúncia *</label><select id="reportReason" required><option value="">Selecione</option><option value="Informação falsa">Informação falsa</option><option value="Golpe ou fraude">Golpe ou fraude</option><option value="Produto ou serviço proibido">Produto ou serviço proibido</option><option value="Conteúdo ofensivo">Conteúdo ofensivo</option><option value="Anúncio duplicado">Anúncio duplicado</option><option value="Outro">Outro</option></select></div><div class="field"><label for="reportDetails">Detalhes (opcional)</label><textarea id="reportDetails" maxlength="1500" placeholder="Explique o que aconteceu..."></textarea></div><button class="btn" type="submit" style="width:100%">Enviar denúncia</button></form>');
  }

  document.addEventListener("click", event => {
    const profileButton = event.target.closest("#viewSellerProfile");
    if (profileButton) openPublicProfile(profileButton.dataset.userId);
    const reportButton = event.target.closest("#reportListing");
    if (reportButton) openReportForm(reportButton.dataset.listingId);
  });

  document.addEventListener("submit", async event => {
    if (event.target.id !== "listingReportForm") return;
    event.preventDefault();
    const user = window.XP_REMOTE.user;
    if (!user) return toast("Entre na sua conta para enviar uma denúncia.");
    const reason = el("reportReason").value;
    const details = el("reportDetails").value.trim();
    const submit = event.target.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = "Enviando...";
    try {
      const { error } = await client.from("reports").insert({
        reporter_id:user.id, listing_id:event.target.dataset.listingId,
        reason, details
      });
      if (error) throw error;
      actionModal().classList.remove("open");
      toast("Denúncia enviada para análise.");
    } catch(error) {
      showError(error);
      submit.disabled = false;
      submit.textContent = "Enviar denúncia";
    }
  });

    const item = event.target.closest("[data-account-action]");
    if (!item) return;
    const action = item.dataset.accountAction;
    if (action === "personal") {
      if (!window.XP_REMOTE.user) return toast("Entre na sua conta para editar o perfil.");
      openProfileSetup(window.XP_REMOTE.profile || {
        display_name: window.XP_REMOTE.user.user_metadata?.display_name || window.XP_REMOTE.user.user_metadata?.full_name || window.XP_REMOTE.user.email?.split("@")[0] || "",
        account_type: "person", bio: "", avatar_url: null
      }, true);
    } else if (action === "ads") {
      page("activity");
      setTimeout(() => el("activityMyGrid")?.scrollIntoView({behavior:"smooth",block:"start"}), 80);
    } else if (action === "security") {
      const email = window.XP_REMOTE.user?.email || "";
      showAccountAction("Segurança e acesso", '<p class="sub">Conta vinculada a <strong>'+esc(email)+'</strong></p><form id="securityForm"><div class="field"><label for="newAccountPassword">Nova senha</label><input id="newAccountPassword" type="password" minlength="8" required autocomplete="new-password" placeholder="Mínimo de 8 caracteres"></div><div class="field"><label for="confirmAccountPassword">Confirme a nova senha</label><input id="confirmAccountPassword" type="password" minlength="8" required autocomplete="new-password" placeholder="Repita a nova senha"></div><button class="btn" type="submit" style="width:100%">Alterar senha</button></form><button class="btn ghost" id="sendPasswordReset" style="width:100%;margin-top:10px">Enviar link de recuperação por e-mail</button>');
    } else if (action === "notifications") {
      const prefs = JSON.parse(localStorage.getItem("xpwork_notification_preferences") || '{"messages":true,"updates":true}');
      showAccountAction("Preferências de avisos", '<p class="sub">Estas opções registram suas preferências neste aparelho. Notificações push ainda não estão disponíveis.</p><form id="notificationForm"><label style="display:flex;gap:10px;padding:12px 0"><input type="checkbox" name="messages" '+(prefs.messages?'checked':'')+'> Avisos sobre mensagens</label><label style="display:flex;gap:10px;padding:12px 0"><input type="checkbox" name="updates" '+(prefs.updates?'checked':'')+'> Novidades do XP WORK</label><button class="btn" type="submit" style="width:100%">Salvar preferências</button></form>');
    } else if (action === "favorites") {
      await openFavorites();
    } else if (action === "help") {
      showAccountAction("Ajuda e suporte", '<div class="panel"><strong>Como publicar um anúncio?</strong><p class="sub">Acesse Anunciar, preencha os dados e publique usando sua conta.</p><strong>Como editar meus dados?</strong><p class="sub">Entre em Dados pessoais para alterar nome, tipo de conta e descrição.</p><strong>Como excluir um anúncio?</strong><p class="sub">Abra Meus anúncios, selecione o anúncio e use a opção de exclusão.</p><strong>Precisa de ajuda?</strong><p class="sub">O canal de atendimento direto ainda não foi configurado no XP WORK.</p></div>');
    }
  });
  document.addEventListener("submit", async event => {
    if (event.target.id === "securityForm") {
      event.preventDefault();
      const password = el("newAccountPassword").value;
      if (password !== el("confirmAccountPassword").value) return toast("As senhas não coincidem.");
      try {
        const { error } = await client.auth.updateUser({password});
        if (error) throw error;
        actionModal().classList.remove("open");
        toast("Senha alterada com sucesso.");
      } catch (error) { showError(error); }
    }
    if (event.target.id === "notificationForm") {
      event.preventDefault();
      const data = new FormData(event.target);
      localStorage.setItem("xpwork_notification_preferences", JSON.stringify({
        messages:data.get("messages") === "on", updates:data.get("updates") === "on"
      }));
      actionModal().classList.remove("open");
      toast("Preferências salvas neste aparelho.");
    }
  });
  document.addEventListener("click", async event => {
    if (event.target.id === "sendPasswordReset") {
      const email = window.XP_REMOTE.user?.email;
      if (!email) return toast("Não foi possível identificar seu e-mail.");
      try {
        const { error } = await client.auth.resetPasswordForEmail(email, {redirectTo:window.location.origin + window.location.pathname});
        if (error) throw error;
        toast("Link de recuperação enviado para seu e-mail.");
      } catch (error) { showError(error); }
    }
    if (event.target.id === "toggleFavorite") {
      const user = window.XP_REMOTE.user;
      const listingId = event.target.dataset.id;
      if (!user) return toast("Entre na sua conta para salvar favoritos.");
      try {
        if (favoriteIds.has(listingId)) {
          const {error} = await client.from("favorites").delete().eq("user_id",user.id).eq("listing_id",listingId);
          if (error) throw error;
          favoriteIds.delete(listingId);
          event.target.textContent = "♡ Salvar nos favoritos";
        } else {
          const {error} = await client.from("favorites").insert({user_id:user.id,listing_id:listingId});
          if (error) throw error;
          favoriteIds.add(listingId);
          event.target.textContent = "♥ Remover dos favoritos";
        }
        toast("Favoritos atualizados.");
      } catch (error) { showError(error); }
    }
  });


  let profileSearchMatches = [];
  async function searchExploreProfiles() {
    const term = el("exploreProfileSearch").value.trim();
    const result = el("exploreProfileMatches");
    if (!window.XP_REMOTE.user) { toast("Entre na sua conta para pesquisar perfis."); return; }
    if (term.length < 2) { result.innerHTML = '<div class="sub">Digite pelo menos 2 letras.</div>'; return; }
    result.innerHTML = '<div class="sub">Pesquisando perfis...</div>';
    try {
      const { data, error } = await client.from("profiles").select("id,display_name,account_type").ilike("display_name", "%"+term.replace(/[%_]/g,"")+"%").order("display_name").limit(12);
      if (error) throw error;
      profileSearchMatches = data || [];
      result.innerHTML = profileSearchMatches.length ? '<div class="profile-match-list">'+profileSearchMatches.map(p=>'<button type="button" class="profile-match" data-explore-profile="'+esc(p.id)+'"><span><strong>'+esc(p.display_name)+'</strong><small>'+esc(({person:"Pessoa física",professional:"Profissional",business:"Comércio / empresa"})[p.account_type]||"Conta NEXAP")+'</small></span><b>Ver anúncios ›</b></button>').join("")+'</div>' : '<div class="empty">Nenhum perfil encontrado com esse nome.</div>';
    } catch(error) { showError(error); result.innerHTML = '<div class="sub">Não foi possível pesquisar perfis.</div>'; }
  }
  el("exploreProfileSearchBtn").addEventListener("click", searchExploreProfiles);
  el("exploreProfileSearch").addEventListener("keydown", event=>{if(event.key==="Enter")searchExploreProfiles();});
  document.addEventListener("click", async event=>{
    const match=event.target.closest("[data-explore-profile]");
    if(match){
      const userId=match.dataset.exploreProfile;
      const profile=profileSearchMatches.find(p=>p.id===userId);
      if(!profile)return;
      try{
        match.disabled=true;match.querySelector("b").textContent="Carregando...";
        const {data,error}=await client.from("listings").select("id,owner_id,title,description,price,price_label,contact_phone,status,created_at,categories(name),cities(name)").eq("owner_id",userId).eq("status","published").order("created_at",{ascending:false}).limit(100);
        if(error)throw error;
        const ids=(data||[]).map(a=>a.id);let imgs=[];
        if(ids.length){const response=await client.from("listing_images").select("id,listing_id,storage_path,alt_text,sort_order").in("listing_id",ids).order("sort_order");if(response.error)throw response.error;imgs=response.data||[];}
        const grouped=new Map();
        imgs.forEach(img=>{if(!grouped.has(img.listing_id))grouped.set(img.listing_id,[]);grouped.get(img.listing_id).push({id:img.id,alt:img.alt_text,url:client.storage.from("listing-images").getPublicUrl(img.storage_path).data.publicUrl});});
        const selected=(data||[]).map(a=>({id:a.id,title:a.title,description:a.description,category:a.categories?.name||"Classificados",price:a.price_label||(a.price!=null?"R$ "+Number(a.price).toLocaleString("pt-BR",{minimumFractionDigits:2}):""),contact:a.contact_phone||"",author:profile.display_name,city:a.cities?.name||"Xapuri",createdAt:new Date(a.created_at).getTime(),owner:"remote",ownerId:userId,images:grouped.get(a.id)||[]}));
        listings=listings.filter(a=>a.ownerId!==userId).concat(selected);
        window.NEXAP_EXPLORE_OWNER=userId;activeFilter="Todos";query="";
        document.getElementById("exploreProfileActiveName").textContent="Anúncios de "+profile.display_name;
        document.getElementById("exploreProfileActive").hidden=false;
        document.getElementById("exploreProfileMatches").innerHTML="";
        render();
        if(!selected.length)toast("Essa conta ainda não tem anúncios publicados.");
      }catch(error){showError(error);match.disabled=false;match.querySelector("b").textContent="Ver anúncios ›";}
    }
    if(event.target.closest("#clearExploreProfile")){
      window.NEXAP_EXPLORE_OWNER=null;
      document.getElementById("exploreProfileActive").hidden=true;
      document.getElementById("exploreProfileSearch").value="";
      document.getElementById("exploreProfileMatches").innerHTML="";
      render();
    }
  });

  async function loadRemote() {
    const [cityResult, categoryResult] = await Promise.all([
      client.from("cities").select("id").eq("slug", "xapuri-ac").maybeSingle(),
      client.from("categories").select("id,name")
    ]);
    if (cityResult.error) throw cityResult.error;
    if (categoryResult.error) throw categoryResult.error;
    window.XP_REMOTE.cityId = cityResult.data?.id || null;
    window.XP_REMOTE.categories = Object.fromEntries((categoryResult.data || []).map(c => [c.name, c.id]));
    const { data, error } = await client.from("listings")
      .select("id,owner_id,title,description,price,price_label,contact_phone,status,created_at,categories(name),cities(name)")
      .eq("status", "published").order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    const listingIds = (data || []).map(a => a.id);
    let imageRows = [];
    if (listingIds.length) {
      const { data: images, error: imageError } = await client.from("listing_images").select("id,listing_id,storage_path,alt_text,sort_order").in("listing_id", listingIds).order("sort_order");
      if (imageError) throw imageError;
      imageRows = images || [];
    }
    const imageMap = new Map();
    imageRows.forEach(image => {
      const url = client.storage.from("listing-images").getPublicUrl(image.storage_path).data.publicUrl;
      if (!imageMap.has(image.listing_id)) imageMap.set(image.listing_id, []);
      imageMap.get(image.listing_id).push({ id:image.id, storage_path:image.storage_path, alt:image.alt_text, url });
    });
    const ownerIds = [...new Set((data || []).map(a => a.owner_id).filter(Boolean))];
    let names = {};
    if (window.XP_REMOTE.user && ownerIds.length) {
      const { data: profiles, error: profileError } = await client.from("profiles").select("id,display_name").in("id", ownerIds);
      if (profileError) throw profileError;
      names = Object.fromEntries((profiles || []).map(profile => [profile.id, profile.display_name]));
    }
    const remote = (data || []).map(a => ({
      id: a.id, title: a.title, category: a.categories?.name || "Classificados",
      description: a.description, price: a.price_label || (a.price != null ? "R$ " + Number(a.price).toLocaleString("pt-BR", {minimumFractionDigits: 2}) : ""),
      contact: a.contact_phone || "", author: names[a.owner_id] || "Anunciante XP WORK",
      city: a.cities?.name || "Xapuri", createdAt: new Date(a.created_at).getTime(),
      owner: "remote", ownerId: a.owner_id, images: imageMap.get(a.id) || []
    }));
    listings = listings.filter(a => a.owner !== "remote").concat(remote);
    render();
    if (typeof window.openListingFromUrl === "function") window.openListingFromUrl();
  }

  async function refreshAccount(session) {
    const user = session?.user || null;
    window.XP_REMOTE.user = user;
    el("signedOut").hidden = !!user;
    el("signedIn").hidden = !user;
    el("memberAccountContent").hidden = true;
    el("accountHero").hidden = !!user;
    el("accountPanelTitle").textContent = user ? "Minha conta" : "Acesse sua conta";

    if (!user) {
      window.XP_REMOTE.profile = null;
      await refreshAdminAccess(null);
      el("connectionState").textContent = "Entre ou cadastre-se";
      try { await loadRemote(); } catch (error) { showError(error); }
      return;
    }

    // A sessão autenticada confirma a conexão da conta. Dados auxiliares
    // são carregados separadamente para que uma consulta não derrube a tela.
    el("connectionState").textContent = "Conta conectada";
    el("accountLabel").textContent = user.email || "";
    el("accountDisplayName").textContent =
      user.user_metadata?.display_name || user.user_metadata?.full_name ||
      user.email?.split("@")[0] || "Usuário XP WORK";
    el("accountAvatar").textContent =
      (el("accountDisplayName").textContent.trim()[0] || "U").toUpperCase();

    try {
      await loadRemote();
    } catch (error) {
      console.error("XP WORK: falha ao carregar anúncios", error);
      toast("Conta conectada, mas não foi possível atualizar os anúncios.");
    }

    try {
      await ensureProfile(user);
      const profile = window.XP_REMOTE.profile || {};
      el("accountDisplayName").textContent =
        profile.display_name || el("accountDisplayName").textContent;
      // Mantém a foto persistida no avatar; não substitui a imagem por iniciais
      // depois que ensureProfile já carregou o registro salvo no Supabase.
      updateProfileSummary(profile);
      el("publishIdentity").textContent =
        "Anúncio identificado como: " + (profile.display_name || "Seu perfil");
    } catch (error) {
      console.error("XP WORK: falha ao carregar perfil", error);
      const detail = [error?.code, error?.message, error?.details, error?.hint]
        .filter(Boolean).join(" — ").slice(0, 220);
      toast("Falha ao carregar perfil: " + (detail || "erro não identificado. Consulte o console."));
    }

    try {
      await refreshAdminAccess(user);

      const { data: savedFavorites, error: favoritesError } = await client
        .from("favorites").select("listing_id").eq("user_id", user.id);
      if (favoritesError) throw favoritesError;
      favoriteIds = new Set((savedFavorites || []).map(row => row.listing_id));
    } catch (error) {
      console.error("XP WORK: falha ao carregar favoritos", error);
    }
  }

  window.XP_REMOTE.isAdmin = false;
  window.XP_REMOTE.adminRole = null;
  window.XP_REMOTE.adminUsers = [];
  function renderAdminUsers(rows) {
    const target=el("adminUsersList"), count=el("adminUserCount");
    if(!target||!count)return;
    count.textContent=rows.length+" conta(s)";
    if(!rows.length){target.innerHTML='<div class="empty">Nenhum usuário encontrado.</div>';return;}
    const owner=window.XP_REMOTE.adminRole==="owner";
    const date=v=>v?new Date(v).toLocaleDateString("pt-BR"):"—";
    target.innerHTML=rows.map(row=>{
      const role=row.admin_role||"user", label=role==="owner"?"Administrador principal":role==="admin"?"Administrador":"Usuário";
      const action=owner&&role!=="owner"&&row.user_id!==window.XP_REMOTE.user?.id?'<button class="btn '+(role==="admin"?"ghost":"secondary")+'" data-admin-role="'+(role==="admin"?"remove":"add")+'" data-user-id="'+esc(row.user_id)+'" type="button">'+(role==="admin"?"Remover administrador":"Tornar administrador")+'</button>':"";
      return '<article class="admin-user"><div class="admin-user-head"><div><strong>'+esc(row.display_name||"Sem nome")+'</strong><small>'+esc(row.email||"E-mail indisponível")+'</small></div><span class="admin-role">'+label+'</span></div><div class="admin-user-meta"><span>Conta: '+esc(row.account_type||"—")+'</span><span>Anúncios: '+Number(row.listings_count||0)+'</span><span>Cadastro: '+date(row.created_at)+'</span><span>Último acesso: '+date(row.last_sign_in_at)+'</span></div>'+(row.bio?'<small>'+esc(row.bio)+'</small>':"")+(action?'<div class="admin-user-actions">'+action+'</div>':"")+'</article>';
    }).join("");
  }
  async function loadAdminUsers(){
    if(!window.XP_REMOTE.isAdmin)return;
    const target=el("adminUsersList");if(target)target.innerHTML='<div class="empty">Atualizando usuários...</div>';
    const {data,error}=await client.rpc("nexap_admin_list_users");
    if(error){if(target)target.innerHTML='<div class="empty">Falha ao carregar: '+esc(error.message)+'</div>';return;}
    window.XP_REMOTE.adminUsers=Array.isArray(data)?data:[];
    renderAdminUsers(window.XP_REMOTE.adminUsers);
  }
  window.NEXAP_ADMIN={open:loadAdminUsers};
  el("adminReload")?.addEventListener("click",loadAdminUsers);
  el("adminUsersList")?.addEventListener("click",async event=>{
    const button=event.target.closest("[data-admin-role]");
    if(!button||window.XP_REMOTE.adminRole!=="owner")return;
    const makeAdmin=button.dataset.adminRole==="add";
    if(!confirm((makeAdmin?"Promover":"Remover")+" este usuário "+(makeAdmin?"a administrador":"de administrador")+"?"))return;
    button.disabled=true;
    const {error}=await client.rpc("nexap_admin_set_role",{p_user_id:button.dataset.userId,p_make_admin:makeAdmin});
    if(error){toast(error.message||"Não foi possível alterar a permissão.");button.disabled=false;return;}
    toast(makeAdmin?"Usuário promovido a administrador.":"Permissão removida.");
    await loadAdminUsers();
  });
  async function refreshAdminAccess(user){
    window.XP_REMOTE.isAdmin=false;window.XP_REMOTE.adminRole=null;window.XP_REMOTE.adminUsers=[];
    if(el("adminMenuItem"))el("adminMenuItem").hidden=true;
    if(!user)return;
    const {data,error}=await client.rpc("nexap_admin_list_users");
    if(error||!Array.isArray(data))return;
    window.XP_REMOTE.adminUsers=data;
    const me=data.find(row=>row.user_id===user.id);
    window.XP_REMOTE.adminRole=me?.admin_role||null;
    window.XP_REMOTE.isAdmin=!!me?.admin_role;
    if(el("adminMenuItem"))el("adminMenuItem").hidden=!window.XP_REMOTE.isAdmin;
  }

  function showError(error) {
    console.error("XP WORK Supabase:", error);
    toast(error?.message || "Não foi possível concluir. Tente novamente.");
  }

  el("googleSignInBtn").addEventListener("click", async () => {
    try {
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin + window.location.pathname
        }
      });
      if (error) throw error;
    } catch (error) { showError(error); }
  });

  el("signUpBtn").addEventListener("click", async () => {
    const name = el("authName").value.trim();
    const email = el("authEmail").value.trim();
    const password = el("authPassword").value;
    if (!name || !email || password.length < 8) {
      toast("Preencha nome, e-mail e senha com pelo menos 8 caracteres.");
      return;
    }
    try {
      const { data, error } = await client.auth.signUp({
        email, password, options: { data: { display_name: name } }
      });
      if (error) throw error;
      if (data.session) {
        await refreshAccount(data.session);
        toast("Conta criada.");
      } else {
        toast("Cadastro iniciado. Confira seu e-mail para confirmar a conta.");
      }
    } catch (error) { showError(error); }
  });

  el("signInBtn").addEventListener("click", async () => {
    const email = el("authEmail").value.trim();
    const password = el("authPassword").value;
    if (!email || !password) { toast("Informe e-mail e senha."); return; }
    try {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await refreshAccount(data.session);
      toast("Login realizado.");
    } catch (error) { showError(error); }
  });

  el("signOutBtn").addEventListener("click", async () => {
    const { error } = await client.auth.signOut();
    if (error) { showError(error); return; }
    await refreshAccount(null);
    toast("Você saiu da conta.");
  });

  client.auth.onAuthStateChange((event, session) => {
    if (["SIGNED_IN", "SIGNED_OUT", "TOKEN_REFRESHED"].includes(event)) {
      setTimeout(() => refreshAccount(session).catch(showError), 0);
    }
  });

  // Publicação validada e associada ao perfil autenticado.
  const publishForm = el("publishForm");
  const publishTitle = el("title");
  const publishDescription = el("description");
  const publishContact = el("contact");
  const publishImages = el("listingImages");
  const imagePreview = el("publishImagePreview");
  let selectedPublishImages = [];
  const MAX_LISTING_IMAGES = 5;
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];
  publishImages.addEventListener("change", () => {
    const files = Array.from(publishImages.files || []);
    if (files.length > MAX_LISTING_IMAGES) { publishImages.value = ""; selectedPublishImages = []; imagePreview.innerHTML = ""; return toast("Escolha no máximo 5 fotos."); }
    if (files.some(file => !allowedImageTypes.includes(file.type) || file.size > MAX_IMAGE_BYTES)) { publishImages.value = ""; selectedPublishImages = []; imagePreview.innerHTML = ""; return toast("Use JPG, PNG ou WebP de até 5 MB por foto."); }
    selectedPublishImages = files;
    imagePreview.innerHTML = files.map((file, index) => '<div class="image-preview"><img src="' + URL.createObjectURL(file) + '" alt="Prévia da foto ' + (index + 1) + '"></div>').join("");
  });
  async function uploadListingImages(listingId, files) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = window.XP_REMOTE.user.id + "/" + listingId + "/" + crypto.randomUUID() + "." + extension;
      const { error: uploadError } = await client.storage.from("listing-images").upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const { error: rowError } = await client.from("listing_images").insert({ listing_id: listingId, storage_path: path, alt_text: file.name.slice(0, 120), sort_order: i });
      if (rowError) throw rowError;
    }
  }
  const updatePublishCounters = () => {
    el("titleCount").textContent = publishTitle.value.length + "/70 caracteres";
    el("descriptionCount").textContent = publishDescription.value.length + "/500 caracteres (mínimo 10)";
  };
  publishTitle.addEventListener("input", updatePublishCounters);
  publishDescription.addEventListener("input", updatePublishCounters);
  publishContact.addEventListener("input", () => {
    const digits = publishContact.value.replace(/\D/g, "").slice(0, 13);
    if (digits.length <= 2) publishContact.value = digits;
    else if (digits.length <= 7) publishContact.value = "(" + digits.slice(0,2) + ") " + digits.slice(2);
    else publishContact.value = "(" + digits.slice(0,2) + ") " + digits.slice(2, digits.length > 10 ? 7 : 6) + "-" + digits.slice(digits.length > 10 ? 7 : 6);
  });
  publishForm.addEventListener("submit", async event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const user = window.XP_REMOTE.user;
    if (!user) { toast("Entre na sua conta antes de publicar."); page("profile"); return; }
    const title = publishTitle.value.trim();
    const description = publishDescription.value.trim();
    let phone = publishContact.value.replace(/\D/g, "");
    if (phone.startsWith("55") && (phone.length === 12 || phone.length === 13)) phone = phone.slice(2);
    const category = el("category").value;
    const categoryId = window.XP_REMOTE.categories[category];
    const cityId = window.XP_REMOTE.cityId;
    if (title.length < 4 || title.length > 70) return toast("O título deve ter entre 4 e 70 caracteres.");
    if (!categoryId || !cityId) return toast("Não foi possível carregar cidade e categoria.");
    if (description.length < 10 || description.length > 500) return toast("A descrição deve ter entre 10 e 500 caracteres.");
    if (phone.length !== 10 && phone.length !== 11) return toast("Informe um WhatsApp válido com DDD.");
    const rawPrice = el("price").value.trim();
    let price = null, priceLabel = rawPrice || null;
    if (rawPrice && !/^a combinar$/i.test(rawPrice)) {
      const normalized = rawPrice.replace(/R\$\s?/gi, "").replace(/\./g, "").replace(",", ".").replace(/\s/g, "");
      if (!/^\d+(\.\d{1,2})?$/.test(normalized) || Number(normalized) < 0) return toast("Informe um preço válido, como 50,00, ou escreva A combinar.");
      price = Number(normalized);
      priceLabel = null;
    }
    const button = el("publishSubmit");
    button.disabled = true;
    button.textContent = "Publicando...";
    try {
      const { data, error } = await client.from("listings").insert({
        owner_id: user.id, city_id: cityId, category_id: categoryId,
        title, description, price, price_label: priceLabel,
        contact_phone: phone, status: "published"
      }).select("id").single();
      if (error) throw error;
      if (selectedPublishImages.length) await uploadListingImages(data.id, selectedPublishImages);
      publishForm.reset();
      selectedPublishImages = [];
      imagePreview.innerHTML = "";
      updatePublishCounters();
      await loadRemote();
      toast("Anúncio publicado para todos.");
      page("profile");
      if (data?.id) setTimeout(() => openDetail(data.id), 120);
    } catch (error) {
      showError(error);
    } finally {
      button.disabled = false;
      button.textContent = "Publicar anúncio";
    }
  }, true);
  el("publishIdentity").textContent = "Anúncio identificado como: " + (window.XP_REMOTE.profile?.display_name || window.XP_REMOTE.user?.user_metadata?.full_name || "Seu perfil");
  // Edição online restrita ao proprietário autenticado.
  function openEditAd(item) {
    pendingEditImages = [];
    removedEditImages.clear();
    const categories = ["Serviços","Comércio","Classificados","Entregas","Empregos","Eventos"];
    const options = categories.map(name => '<option value="'+name+'" '+(item.category===name?'selected':'')+'>'+name+'</option>').join("");
    el("listingPageContent").innerHTML =
      '<h2 style="font-size:20px;margin:8px 0">Editar anúncio</h2>' +
      '<form id="editAdForm" data-id="'+esc(item.id)+'">' +
      '<div class="field"><label for="editAdTitle">Título</label><input id="editAdTitle" maxlength="70" required value="'+esc(item.title)+'"></div>' +
      '<div class="field"><label for="editAdCategory">Categoria</label><select id="editAdCategory" required>'+options+'</select></div>' +
      '<div class="field"><label for="editAdPrice">Preço</label><input id="editAdPrice" value="'+esc(item.price||'')+'" placeholder="Ex.: A combinar"></div>' +
      '<div class="field"><label for="editAdDescription">Descrição</label><textarea id="editAdDescription" maxlength="500" required>'+esc(item.description)+'</textarea></div>' +
      '<div class="field"><label>Fotos atuais</label><div class="image-preview-grid" id="editCurrentImages">' +
        (item.images || []).map(img => '<div class="image-preview"><img src="'+esc(img.url)+'" alt="'+esc(img.alt||item.title)+'"><button type="button" data-remove-image="'+esc(img.id)+'" aria-label="Remover foto">×</button></div>').join('') +
        '</div><small class="sub">Toque no × para remover uma foto.</small></div>' +
      '<div class="field"><label for="editAdImages">Adicionar fotos (até 5 no total)</label><input id="editAdImages" type="file" accept="image/jpeg,image/png,image/webp" multiple><small class="sub">JPG, PNG ou WebP. Até 5 MB por foto.</small><div id="editImagePreview" class="image-preview-grid"></div></div>' +
      '<div class="field"><label for="editAdContact">WhatsApp ou telefone</label><input id="editAdContact" inputmode="tel" required value="'+esc(item.contact||'')+'"></div>' +
      '<button class="btn" type="submit" style="width:100%">Salvar alterações</button>' +
      '<button class="btn ghost" id="cancelEditAd" type="button" style="width:100%;margin-top:8px">Cancelar</button></form>';
  }

  let pendingEditImages = [];
  let removedEditImages = new Set();
  document.addEventListener("change", event => {
    if (event.target.id !== "editAdImages") return;
    const item = listings.find(a => a.id === el("editAdForm")?.dataset.id);
    const currentCount = (item?.images || []).filter(img => !removedEditImages.has(img.id)).length;
    const files = Array.from(event.target.files || []);
    if (currentCount + files.length > MAX_LISTING_IMAGES) { event.target.value = ""; pendingEditImages = []; el("editImagePreview").innerHTML = ""; return toast("O anúncio pode ter no máximo 5 fotos."); }
    if (files.some(file => !allowedImageTypes.includes(file.type) || file.size > MAX_IMAGE_BYTES)) { event.target.value = ""; pendingEditImages = []; el("editImagePreview").innerHTML = ""; return toast("Use JPG, PNG ou WebP de até 5 MB por foto."); }
    pendingEditImages = files;
    el("editImagePreview").innerHTML = files.map((file,index) => '<div class="image-preview"><img src="' + URL.createObjectURL(file) + '" alt="Nova foto ' + (index+1) + '"></div>').join("");
  });
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-remove-image]");
    if (!button) return;
    removedEditImages.add(button.dataset.removeImage);
    button.closest(".image-preview")?.remove();
  });
  document.addEventListener("click", event => {
    const button = event.target.closest("#editAd");
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const item = listings.find(a => a.id === button.dataset.id);
    if (!item || item.owner !== "remote" || item.ownerId !== window.XP_REMOTE.user?.id) {
      toast("Você só pode editar seus próprios anúncios.");
      return;
    }
    openEditAd(item);
  }, true);
  document.addEventListener("click", event => {
    if (event.target.id === "cancelEditAd") {
      const item = listings.find(a => a.id === el("editAdForm")?.dataset.id);
      if (item) openDetail(item.id);
    }
  });
  document.addEventListener("submit", async event => {
    if (event.target.id !== "editAdForm") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const user = window.XP_REMOTE.user;
    const item = listings.find(a => a.id === event.target.dataset.id);
    if (!user || !item || item.owner !== "remote" || item.ownerId !== user.id) {
      toast("Você só pode editar seus próprios anúncios.");
      return;
    }
    const category = el("editAdCategory").value;
    const categoryId = window.XP_REMOTE.categories[category];
    if (!categoryId) return toast("Não foi possível identificar a categoria.");
    const rawPrice = el("editAdPrice").value.trim();
    let price = null, priceLabel = rawPrice || null;
    if (rawPrice) {
      const normalized = rawPrice.replace(/[^0-9,.]/g, "").replace(",", ".");
      if (/^\d+(\.\d{1,2})?$/.test(normalized)) { price = Number(normalized); priceLabel = null; }
    }
    const button = event.target.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = "Salvando...";
    try {
      const { data, error } = await client.from("listings").update({
        title: el("editAdTitle").value.trim(),
        category_id: categoryId,
        price, price_label: priceLabel,
        description: el("editAdDescription").value.trim(),
        contact_phone: el("editAdContact").value.trim()
      }).eq("id", item.id).eq("owner_id", user.id).select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("O anúncio não foi atualizado. Verifique se ele ainda pertence à sua conta.");
      for (const image of (item.images || []).filter(img => removedEditImages.has(img.id))) await removeListingImage(image);
      const remaining = (item.images || []).filter(img => !removedEditImages.has(img.id)).length;
      if (pendingEditImages.length) await uploadListingImages(item.id, pendingEditImages.slice(0, MAX_LISTING_IMAGES - remaining));
      pendingEditImages = [];
      removedEditImages.clear();
      await loadRemote();
      openDetail(item.id);
      toast("Anúncio atualizado.");
    } catch (error) {
      showError(error);
      button.disabled = false;
      button.textContent = "Salvar alterações";
    }
  });
  
  // Exclusão online apenas para o dono autenticado.
  document.addEventListener("click", async event => {
    const button = event.target.closest("#deleteAd");
    if (!button) return;
    const item = listings.find(a => a.id === button.dataset.id);
    if (item?.owner !== "remote") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!confirm("Excluir este anúncio online?")) return;
    try {
      const { error } = await client.from("listings").delete()
        .eq("id", item.id).eq("owner_id", window.XP_REMOTE.user?.id);
      if (error) throw error;
      await loadRemote();
      closeListingPage();
      toast("Anúncio excluído.");
    } catch (error) { showError(error); }
  }, true);

  const baseRender = render;
  render = function() {
    baseRender();
    const mine = listings.filter(a => a.owner === "local" || (a.owner === "remote" && a.ownerId === window.XP_REMOTE.user?.id));
    el("myCount").textContent = mine.length;
    renderInto("myGrid", mine);
    if (el("activityMyGrid")) renderInto("activityMyGrid", mine);
  };

  const originalOpenDetail = openDetail;
  openDetail = function(id) {
    originalOpenDetail(id);
    const item = listings.find(a => a.id === id);
    if (item?.owner === "remote" && item.ownerId !== window.XP_REMOTE.user?.id) {
      const button = document.createElement("button");
      button.className = "btn secondary";
      button.id = "toggleFavorite";
      button.dataset.id = item.id;
      button.style.cssText = "width:100%;margin-top:10px";
      button.textContent = favoriteIds.has(item.id) ? "♥ Remover dos favoritos" : "♡ Salvar nos favoritos";
      el("listingPageContent").appendChild(button);
    }
  };
  const baseOpenDetail = openDetail;
  openDetail = function(id) {
    baseOpenDetail(id);
    const item = listings.find(a => a.id === id);
    if (item?.owner === "remote" && item.ownerId !== window.XP_REMOTE.user?.id) {
      const trustActions = document.createElement("div");
      trustActions.className = "listing-trust-actions";
      trustActions.innerHTML =
        '<button class="btn secondary" id="viewSellerProfile" data-user-id="' + esc(item.ownerId) + '" type="button">Ver perfil do anunciante</button>' +
        '<button class="btn ghost" id="reportListing" data-listing-id="' + esc(item.id) + '" type="button">Denunciar anúncio</button>';
      el("listingPageContent").appendChild(trustActions);
    }
    if (item?.owner === "remote" && item.ownerId === window.XP_REMOTE.user?.id) {
      el("listingPageContent").insertAdjacentHTML("beforeend",
        '<button class="btn secondary" id="editAd" data-id="' + esc(item.id) + '" style="width:100%;margin-top:10px">Editar anúncio</button>' +
        '<button class="btn ghost" id="deleteAd" data-id="' + esc(item.id) + '" style="width:100%;margin-top:8px">Excluir meu anúncio</button>');
    }
  };

  // Garante a abertura dos detalhes dos anúncios em qualquer grade/lista.
  // O listener em captura evita que outros handlers de interface bloqueiem o toque.
  document.addEventListener("click", event => {
    const button = event.target.closest("button.detail, .detail[data-id]");
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const id = button.dataset.id;
    if (id) openDetail(id);
  }, true);

  (async () => {
    try {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      await refreshAccount(data.session);
    } catch (error) {
      el("connectionState").textContent = "Falha na conexão";
      showError(error);
    }
  })();
})();
