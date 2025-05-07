"use client";

import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { MoonIcon, SunIcon, YoutubeIcon } from "lucide-react";

export default function Header() {
  const { theme, setTheme } = useTheme();
  
  return (
    <header className="sticky top-0 z-10 border-b border-border backdrop-blur-md bg-background/80">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <YoutubeIcon className="h-6 w-6 text-red-600" />
          <h1 className="text-xl font-bold">YT-Chapter-Generator</h1>
        </div>
        
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          aria-label="Toggle theme"
        >
          {theme === "light" ? (
            <MoonIcon className="h-5 w-5" />
          ) : (
            <SunIcon className="h-5 w-5" />
          )}
        </Button>
      </div>
    </header>
  );
}