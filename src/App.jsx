import React from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import Hub from "./Hub.jsx";
import Lab from "./wc2026_travel_burden_lab.jsx";

// HashRouter (not BrowserRouter) so client deep-links resolve on GitHub Pages
// with no server rewrite config. Routes:  / = hub, /wc2026 = the lab.
export default function App(){
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Hub/>} />
        <Route path="/wc2026" element={<Lab/>} />
        <Route path="*" element={<Hub/>} />
      </Routes>
    </HashRouter>
  );
}
