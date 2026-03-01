"use client";

import { Bot } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex flex-col items-center text-center px-4">
      <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-500/10 mb-4 shadow-sm animate-float">
        <Bot className="h-7 w-7 text-blue-600" />
      </div>
      <p className="text-foreground font-semibold text-lg mb-2">
        Start a conversation to generate React components
      </p>
      <p className="text-muted-foreground text-sm max-w-sm">
        I can help you create buttons, forms, cards, and more
      </p>
    </div>
  );
}
