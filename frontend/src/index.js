import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import AdminPage from "@/components/AdminPage";

const isAdmin = typeof window !== "undefined" && window.location.pathname.startsWith("/admin");

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    {isAdmin ? <AdminPage /> : <App />}
  </React.StrictMode>,
);
