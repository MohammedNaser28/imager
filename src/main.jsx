import React from "react";
import ReactDOM from "react-dom/client";
import FolderSelector from "./App";
import './App.css'  // or './index.css' depending on which file you used
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <FolderSelector />
  </React.StrictMode>,
);
