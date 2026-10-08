import Nav from "./components/Nav.jsx";
import Hero from "./components/Hero.jsx";
import Flow from "./components/Flow.jsx";
import Roles from "./components/Roles.jsx";
import Footer from "./components/Footer.jsx";
import FeatureGrid from "./components/FeatureGrid.jsx";

export default function App() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Flow />
        <Roles />
        <FeatureGrid />
      </main>
      <Footer />
    </>
  );
}