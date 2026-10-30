
(() => {
  const URL = "https://balojriovbjzywjrvpyw.supabase.co";
  const KEY = "sb_publishable_MLTvK0L_sYVYgnW5SZXfWQ_ISAFHo22";
  const client = window.supabase.createClient(URL, KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const el = id => document.getElementById(id);
  window.XP_REMOTE = { client, user: null, cityId: null, categories: {}, profile: null };
  let profileSetupOpen = false;

  async function ensureProfile(user) {
    const { data: existing, error: readError } = await client.from("profiles")
      .select("id,display_name,account_type,bio,city_id")
      .eq("id", user.id).maybeSingle();
    if (readError) throw readError;
    if (!existing) {
      const displayName = (user.user_metadata?.display_name || user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "Usuário").slice(0, 60);
      const { error: insertError } = await client.from("profiles").insert({
        id: user.id, display_name: displayName, city_id: window.XP_REMOTE.cityId
      });
      if (insertError) throw insertError;
    } else if (!existing.city_id && window.XP_REMOTE.cityId) {
      const { error: cityError } = await client.from("profiles")
        .update({ city_id: window.XP_REMOTE.cityId }).eq("id", user.id);
      if (cityError) throw cityError;
    }
    const { data, error } = await client.from("profiles")
      .select("id,display_name,account_type,bio,city_id")
      .eq("id", user.id).single();
    if (error) throw error;
    window.XP_REMOTE.profile = data;
    if (!data.bio?.trim()) openProfileSetup(data, false);
    else updateProfileSummary(data);
  }

  function updateProfileSummary(profile) {
    const summary = el("profileSummary");
    if (!summary) return;
    const types = { person: "Pessoa física", professional: "Profissional", business: "Comércio / empresa" };
    summary.textContent = profile.display_name + " • " + (types[profile.account_type] || "Pessoa física") + (profile.bio ? "\n" + profile.bio : "");
    summary.style.whiteSpace = "pre-line";
  }

  function openProfileSetup(profile = {}, editing = true) {
    if (profileSetupOpen) return;
    profileSetupOpen = true;
    el("profileSetupTitle").textContent = editing ? "Editar suas informações" : "Complete seu perfil";
    el("profileDisplayName").value = profile.display_name || "";
    el("profileAccountType").value = profile.account_type || "person";
    el("profileBio").value = profile.bio || "";
    el("profileSetupModal").classList.add("open");
  }

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
      const { error } = await client.from("profiles").update(profile).eq("id", user.id);
      if (error) throw error;
      window.XP_REMOTE.profile = { ...window.XP_REMOTE.profile, ...profile };
      updateProfileSummary(window.XP_REMOTE.profile);
      el("profileSetupModal").classList.remove("open");
      profileSetupOpen = false;
      toast("Informações do perfil salvas.");
    } catch (error) {
      showError(error);
    } finally {
      button.disabled = false;
      button.textContent = "Salvar e continuar";
    }
  });

  let favoriteIds = new Set();
  const actionModal = () => el("detailModal");
  function showAccountAction(title, body) {
    el("listingPageContent").innerHTML = '<h2 style="font-size:20px;margin:12px 0">' + title + '</h2>' + body;
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
    const item = event.target.closest("[data-account-action]");
    if (!item) return;
    const action = item.dataset.accountAction;
    if (action === "personal") {
      if (window.XP_REMOTE.profile) openProfileSetup(window.XP_REMOTE.profile, true);
    } else if (action === "ads") {
      page("profile");
      setTimeout(() => el("myAdsSection").scrollIntoView({behavior:"smooth",block:"start"}), 80);
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
    const remote = (data || []).map(a => ({
      id: a.id, title: a.title, category: a.categories?.name || "Classificados",
      description: a.description, price: a.price_label || (a.price != null ? "R$ " + Number(a.price).toLocaleString("pt-BR", {minimumFractionDigits: 2}) : ""),
      contact: a.contact_phone || "", author: "Usuário XP WORK",
      city: a.cities?.name || "Xapuri", createdAt: new Date(a.created_at).getTime(),
      owner: "remote", ownerId: a.owner_id
    }));
    listings = listings.filter(a => a.owner !== "remote").concat(remote);
    render();
  }

  async function refreshAccount(session) {
    const user = session?.user || null;
    window.XP_REMOTE.user = user;
    el("signedOut").hidden = !!user;
    el("signedIn").hidden = !user;
    el("memberAccountContent").hidden = !user;
    el("accountHero").hidden = !!user;
    el("accountPanelTitle").textContent = user ? "Minha conta" : "Acesse sua conta";
    if (user) {
      await loadRemote();
      await ensureProfile(user);
      const { data: savedFavorites, error: favoritesError } = await client.from("favorites").select("listing_id").eq("user_id", user.id);
      if (favoritesError) throw favoritesError;
      favoriteIds = new Set((savedFavorites || []).map(row => row.listing_id));
      el("accountLabel").textContent = user.email || "";
      const profile = window.XP_REMOTE.profile || {};
      el("accountDisplayName").textContent = profile.display_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "Usuário XP WORK";
      el("accountAvatar").textContent = (el("accountDisplayName").textContent.trim()[0] || "U").toUpperCase();
      el("connectionState").textContent = "Conta conectada";
    } else {
      window.XP_REMOTE.profile = null;
      el("connectionState").textContent = "Entre ou cadastre-se";
      await loadRemote();
    }
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

  // Intercepta a publicação antiga para não salvar anúncios novos apenas no aparelho.
  el("publishForm").addEventListener("submit", async event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const user = window.XP_REMOTE.user;
    if (!user) { toast("Entre na sua conta antes de publicar."); page("profile"); return; }
    const category = el("category").value;
    const categoryId = window.XP_REMOTE.categories[category];
    const cityId = window.XP_REMOTE.cityId;
    if (!categoryId || !cityId) { toast("Não foi possível carregar cidade e categoria."); return; }
    const rawPrice = el("price").value.trim();
    let price = null, priceLabel = rawPrice || null;
    if (rawPrice) {
      const normalized = rawPrice.replace(/[^0-9,.]/g, "").replace(",", ".");
      if (/^\d+(\.\d{1,2})?$/.test(normalized)) { price = Number(normalized); priceLabel = null; }
    }
    try {
      const { error } = await client.from("listings").insert({
        owner_id: user.id, city_id: cityId, category_id: categoryId,
        title: el("title").value.trim(), description: el("description").value.trim(),
        price, price_label: priceLabel, contact_phone: el("contact").value.trim(),
        status: "published"
      });
      if (error) throw error;
      event.target.reset();
      await loadRemote();
      toast("Anúncio publicado para todos.");
      page("profile");
    } catch (error) { showError(error); }
  }, true);

  // Edição online restrita ao proprietário autenticado.
  function openEditAd(item) {
    const categories = ["Serviços","Comércio","Classificados","Entregas","Empregos","Eventos"];
    const options = categories.map(name => '<option value="'+name+'" '+(item.category===name?'selected':'')+'>'+name+'</option>').join("");
    el("listingPageContent").innerHTML =
      '<h2 style="font-size:20px;margin:8px 0">Editar anúncio</h2>' +
      '<form id="editAdForm" data-id="'+esc(item.id)+'">' +
      '<div class="field"><label for="editAdTitle">Título</label><input id="editAdTitle" maxlength="70" required value="'+esc(item.title)+'"></div>' +
      '<div class="field"><label for="editAdCategory">Categoria</label><select id="editAdCategory" required>'+options+'</select></div>' +
      '<div class="field"><label for="editAdPrice">Preço</label><input id="editAdPrice" value="'+esc(item.price||'')+'" placeholder="Ex.: A combinar"></div>' +
      '<div class="field"><label for="editAdDescription">Descrição</label><textarea id="editAdDescription" maxlength="500" required>'+esc(item.description)+'</textarea></div>' +
      '<div class="field"><label for="editAdContact">WhatsApp ou telefone</label><input id="editAdContact" inputmode="tel" required value="'+esc(item.contact||'')+'"></div>' +
      '<button class="btn" type="submit" style="width:100%">Salvar alterações</button>' +
      '<button class="btn ghost" id="cancelEditAd" type="button" style="width:100%;margin-top:8px">Cancelar</button></form>';
  }
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
      el("detailModal").classList.remove("open");
      toast("Anúncio excluído.");
    } catch (error) { showError(error); }
  }, true);

  const baseRender = render;
  render = function() {
    baseRender();
    const mine = listings.filter(a => a.owner === "local" || (a.owner === "remote" && a.ownerId === window.XP_REMOTE.user?.id));
    el("myCount").textContent = mine.length;
    renderInto("myGrid", mine);
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
    if (item?.owner === "remote" && item.ownerId === window.XP_REMOTE.user?.id) {
      el("listingPageContent").insertAdjacentHTML("beforeend",
        '<button class="btn secondary" id="editAd" data-id="' + esc(item.id) + '" style="width:100%;margin-top:10px">Editar anúncio</button>' +
        '<button class="btn ghost" id="deleteAd" data-id="' + esc(item.id) + '" style="width:100%;margin-top:8px">Excluir meu anúncio</button>');
    }
  };

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
