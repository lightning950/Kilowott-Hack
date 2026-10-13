import { useCallback, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useHotkey } from "@/hooks/useHotkey";
import { CommandPalette } from "./CommandPalette";
import { PaletteContext } from "./paletteContext";
import { Sidebar } from "./Sidebar";

const readCollapsed = () => {
  try {
    return localStorage.getItem("pim-sidebar") === "collapsed";
  } catch {
    return false;
  }
};

export const AppShell = () => {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  useHotkey("mod+k", () => setPaletteOpen((o) => !o));
  useHotkey("n", () => navigate("/products/new"), !paletteOpen);

  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem("pim-sidebar", c ? "expanded" : "collapsed");
      } catch {
        /* ignore */
      }
      return !c;
    });

  return (
    <PaletteContext.Provider value={{ open: openPalette }}>
      <div className="flex h-full">
        <Sidebar collapsed={collapsed} onToggle={toggle} />
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={closePalette} />
    </PaletteContext.Provider>
  );
};
