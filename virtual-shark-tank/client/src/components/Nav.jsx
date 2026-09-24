export default function Nav() {
  return (
    <header className="nav">
      <a className="nav__brand" href="/">SmartShark</a>
      <nav className="nav__links" aria-label="Main">
        <a href="#how">How it works</a>
        <a href="#who">Who it's for</a>
        <a className="btn btn--small" href="/register">Sign up</a>
      </nav>
    </header>
  );
}