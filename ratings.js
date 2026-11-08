(() => {
  const client = () => window.XP_REMOTE?.client;
  const user = () => window.XP_REMOTE?.user;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[char]));
  const stars = value => "★".repeat(Number(value)||0) + "☆".repeat(5-(Number(value)||0));
  const isJob = category => /^(emprego|empregos|vagas)$/i.test(String(category||"").trim());

  async function render(listing) {
    const host = document.getElementById("listingReviews");
    if (!host || !listing || listing.owner !== "remote" || isJob(listing.category)) return;
    const db = client();
    if (!db) { host.innerHTML = '<p class="sub">As avaliações estarão disponíveis quando a conexão for concluída.</p>'; return; }
    host.innerHTML = '<div class="review-loading">Carregando avaliações...</div>';
    try {
      const {data: rows, error} = await db.from("listing_reviews")
        .select("id,reviewer_id,rating,comment,created_at")
        .eq("listing_id", listing.id).eq("status","published")
        .order("created_at",{ascending:false}).limit(50);
      if (error) throw error;
      const reviews = rows || [];
      const avg = reviews.length ? reviews.reduce((sum,row)=>sum+row.rating,0)/reviews.length : 0;
      const current = user();
      const own = current ? reviews.find(row=>row.reviewer_id===current.id) : null;
      const canReview = !!current && current.id !== listing.ownerId;
      host.innerHTML =
        '<div class="reviews-summary"><div><strong class="reviews-average">'+(reviews.length?avg.toFixed(1).replace(".",","):"—")+'</strong><span class="reviews-stars">'+stars(Math.round(avg))+'</span><small>'+(reviews.length+' '+(reviews.length===1?'avaliação':'avaliações'))+'</small></div><p>'+(reviews.length?'Média das avaliações publicadas.':'Este anúncio ainda não recebeu avaliações.')+'</p></div>'+
        (canReview?'<form id="listingReviewForm" data-listing-id="'+esc(listing.id)+'" class="review-form"><h3>'+(own?'Editar sua avaliação':'Avaliar este anúncio')+'</h3><div class="field"><label for="reviewRating">Sua nota</label><select id="reviewRating" required><option value="">Escolha de 1 a 5 estrelas</option><option value="5" '+(own?.rating===5?'selected':'')+'>5 — Excelente</option><option value="4" '+(own?.rating===4?'selected':'')+'>4 — Muito bom</option><option value="3" '+(own?.rating===3?'selected':'')+'>3 — Bom</option><option value="2" '+(own?.rating===2?'selected':'')+'>2 — Regular</option><option value="1" '+(own?.rating===1?'selected':'')+'>1 — Ruim</option></select></div><div class="field"><label for="reviewComment">Comentário (opcional)</label><textarea id="reviewComment" maxlength="800" placeholder="Conte brevemente como foi sua experiência...">'+esc(own?.comment||"")+'</textarea></div><button class="btn" type="submit">'+(own?'Atualizar avaliação':'Enviar avaliação')+'</button></form>':(!current?'<p class="review-signin">Entre na sua conta para avaliar este anúncio.</p>':(current.id===listing.ownerId?'<p class="review-signin">Você não pode avaliar seu próprio anúncio.</p>':'')))+
        '<div class="reviews-list">'+(reviews.length?reviews.map(row=>'<article class="review-item"><div class="review-item-head"><span class="reviews-stars" aria-label="'+row.rating+' de 5 estrelas">'+stars(row.rating)+'</span><time>'+new Date(row.created_at).toLocaleDateString("pt-BR")+'</time></div>'+(row.comment?'<p>'+esc(row.comment)+'</p>':'<p class="review-no-comment">Avaliação sem comentário.</p>')+(current&&current.id!==row.reviewer_id?'<button type="button" class="review-report" data-review-report="'+esc(row.id)+'">Denunciar avaliação</button>':'')+'</article>').join(""):'<div class="reviews-empty">As avaliações aparecerão aqui quando forem enviadas.</div>')+'</div>'+
        '<p class="review-disclaimer">As avaliações são enviadas por usuários e não representam, necessariamente, uma compra verificada.</p>';
    } catch (error) {
      console.error("AllXap: falha ao carregar avaliações",error);
      host.innerHTML = '<p class="sub">Não foi possível carregar as avaliações agora.</p>';
    }
  }

  document.addEventListener("submit", async event => {
    if (event.target.id !== "listingReviewForm") return;
    event.preventDefault();
    const db=client(), current=user(), form=event.target;
    if(!db||!current)return;
    const button=form.querySelector('button[type="submit"]');
    button.disabled=true;button.textContent="Enviando...";
    try{
      const payload={listing_id:form.dataset.listingId,reviewer_id:current.id,rating:Number(document.getElementById("reviewRating").value),comment:document.getElementById("reviewComment").value.trim()};
      const {error}=await db.from("listing_reviews").upsert(payload,{onConflict:"listing_id,reviewer_id"});
      if(error)throw error;
      const listing=window.AllXap_LISTING_CONTEXT;
      if(listing)await render({...listing,owner:"remote"});
      window.toast?.("Avaliação salva.");
    }catch(error){
      console.error("AllXap: falha ao salvar avaliação",error);
      window.toast?.("Não foi possível salvar. Verifique se o anúncio aceita avaliações.");
      button.disabled=false;button.textContent="Tentar novamente";
    }
  });

  document.addEventListener("click",async event=>{
    const button=event.target.closest("[data-review-report]");
    if(!button)return;
    const current=user(),db=client();
    if(!current||!db){window.toast?.("Entre na sua conta para denunciar.");return;}
    const reason=window.prompt("Por que deseja denunciar esta avaliação? (mínimo 5 caracteres)");
    if(reason===null)return;
    if(reason.trim().length<5){window.toast?.("Informe um motivo com pelo menos 5 caracteres.");return;}
    try{
      const {error}=await db.from("listing_review_reports").insert({review_id:button.dataset.reviewReport,reporter_id:current.id,reason:reason.trim().slice(0,100)});
      if(error)throw error;
      button.disabled=true;button.textContent="Denúncia enviada";
      window.toast?.("Denúncia enviada para análise.");
    }catch(error){
      console.error("AllXap: falha ao denunciar avaliação",error);
      window.toast?.("Não foi possível enviar a denúncia. Talvez você já tenha denunciado esta avaliação.");
    }
  });

  window.AllXap_RATINGS={render};
})();