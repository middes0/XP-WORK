
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

  el("editProfileBtn").addEventListener("click", () => {
    if (window.XP_REMOTE.profile) openProfileSetup(window.XP_REMOTE.profile, true);
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
    if (user) {
      el("accountLabel").textContent = "Conectado como " + user.email;
      await loadRemote();
      await ensureProfile(user);
      el("connectionState").textContent = "Conta conectada";
    } else {
      window.XP_REMOTE.profile = null;
      el("connectionState").textContent = "Conectado • entre na sua conta";
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

  const baseOpenDetail = openDetail;
  openDetail = function(id) {
    baseOpenDetail(id);
    const item = listings.find(a => a.id === id);
    if (item?.owner === "remote" && item.ownerId === window.XP_REMOTE.user?.id) {
      el("detailContent").insertAdjacentHTML("beforeend",
        '<button class="btn ghost" id="deleteAd" data-id="' + esc(item.id) + '" style="width:100%;margin-top:10px">Excluir meu anúncio</button>');
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
