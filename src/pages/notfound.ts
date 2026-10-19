export default function notFound(root: HTMLElement) {
  root.innerHTML = `
    <section class="empty-page">
      <div class="big-emoji">🧭</div>
      <h1>길을 잃었어요</h1>
      <p>주소가 바뀌었거나 없는 페이지예요.</p>
      <a class="btn primary" href="/">내 계획으로</a>
    </section>`;
}
