import Nav from "./components/Nav.jsx";
import Hero from "./components/Hero.jsx";
import Flow from "./components/Flow.jsx";
import Roles from "./components/Roles.jsx";
import Footer from "./components/Footer.jsx";

export default function App() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Flow />
        <Roles />
      </main>
      <Footer />
    </>
  );
}