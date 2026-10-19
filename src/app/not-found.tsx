export default function NotFound() {
  return (
    <section className="container page-head nf">
      <p className="eyebrow">404 · Gate closed</p>
      <h1 className="display">
        Lost <em>flight.</em>
      </h1>
      <p className="lede">주소가 바뀌었거나, 삭제된 계획이에요.</p>
      <p style={{ marginTop: 24 }}>
        <a className="btn btn--solid" href="/">
          떠날 곳으로 →
        </a>
      </p>
    </section>
  );
}
