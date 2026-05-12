import { ReactNode, useEffect, useState } from "react";
import { NavLink, useNavigate, Link } from "react-router-dom";
import { LayoutDashboard, Wallet, PlusCircle, Tags, CalendarRange, History, LogOut, Menu, Lock, PieChart, LayoutTemplate, Pencil, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const links = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/accounts", icon: Wallet, label: "Accounts" },
  { to: "/add", icon: PlusCircle, label: "Add Transaction" },
  { to: "/budget", icon: PieChart, label: "Budget" },
  { to: "/budget-templates", icon: LayoutTemplate, label: "Budget Templates" },
  { to: "/holds", icon: Lock, label: "Holds" },
  { to: "/categories", icon: Tags, label: "Categories" },
  { to: "/pay-periods", icon: CalendarRange, label: "Pay Periods" },
  { to: "/history", icon: History, label: "Account History" },
];

const TITLE_KEY = "app:customTitle";
const THEME_KEY = "app:theme";
const DEFAULT_TITLE = "Money Tracker";

const NavItems = ({ onClick }: { onClick?: () => void }) => (
  <nav className="space-y-1">
    {links.map(l => (
      <NavLink key={l.to} to={l.to} end={l.end} onClick={onClick}
        className={({ isActive }) => cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-primary-foreground shadow-sm"
            : "text-sidebar-foreground hover:bg-sidebar-accent/60"
        )}
      >
        <l.icon className="h-4 w-4" />{l.label}
      </NavLink>
    ))}
  </nav>
);

export default function AppLayout({ children }: { children: ReactNode }) {
  const { signOut, user } = useAuth();
  const nav = useNavigate();
  const handleOut = async () => { await signOut(); nav("/auth"); };

  const [title, setTitle] = useState<string>(DEFAULT_TITLE);
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<string>("");
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(TITLE_KEY);
      if (saved && saved.trim()) setTitle(saved);
      const t = (localStorage.getItem(THEME_KEY) as "light" | "dark" | null) || "light";
      setTheme(t);
      document.documentElement.classList.toggle("dark", t === "dark");
    } catch {}
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try { localStorage.setItem(THEME_KEY, next); } catch {}
  };

  const openEdit = () => { setDraft(title); setEditOpen(true); };
  const saveTitle = (e: React.FormEvent) => {
    e.preventDefault();
    const v = draft.trim() || DEFAULT_TITLE;
    setTitle(v);
    try { localStorage.setItem(TITLE_KEY, v); } catch {}
    setEditOpen(false);
  };

  const sidebar = (
    <div className="flex flex-col h-full p-4 bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 mb-8 px-2">
        <Link to="/" aria-label="Go to dashboard" className="h-9 w-9 rounded-xl flex items-center justify-center hover:opacity-90 transition-opacity" style={{ background: "var(--gradient-primary)" }}>
          <Wallet className="h-5 w-5 text-primary-foreground" />
        </Link>
        <Link to="/" className="min-w-0 hover:opacity-90 transition-opacity">
          <div className="font-semibold text-sm text-sidebar-primary-foreground truncate">{title}</div>
          <div className="text-[11px] text-sidebar-foreground/70 -mt-0.5">Money Tracker</div>
        </Link>
        <Button variant="ghost" size="icon" className="ml-auto h-7 w-7 text-sidebar-foreground/70 hover:text-sidebar-primary-foreground" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-sidebar-foreground/70 hover:text-sidebar-primary-foreground" onClick={openEdit} aria-label="Edit app title">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>
      <NavItems />
      <div className="mt-auto pt-4 border-t border-sidebar-border">
        <div className="px-2 pb-2 text-xs text-sidebar-foreground/70 truncate">{user?.email}</div>
        <Button variant="ghost" size="sm" onClick={handleOut} className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary-foreground">
          <LogOut className="h-4 w-4 mr-2" />Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="hidden lg:block w-64 shrink-0 border-r border-sidebar-border">{sidebar}</aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden grid grid-cols-3 items-center px-4 h-14 border-b bg-card">
          <Sheet>
            <SheetTrigger asChild><Button variant="ghost" size="icon" className="justify-self-start"><Menu className="h-5 w-5" /></Button></SheetTrigger>
            <SheetContent side="left" className="p-0 w-64 bg-sidebar border-sidebar-border">{sidebar}</SheetContent>
          </Sheet>
          <Link to="/" className="flex items-center gap-2 justify-self-center min-w-0 hover:opacity-90 transition-opacity">
            <span className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: "var(--gradient-primary)" }}>
              <Wallet className="h-4 w-4 text-primary-foreground" />
            </span>
            <span className="font-semibold truncate">{title}</span>
          </Link>
          <div className="justify-self-end flex items-center">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={openEdit} aria-label="Edit app title">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleOut} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-auto">
          <div className="max-w-7xl mx-auto p-4 md:p-8">{children}</div>
        </main>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit App Title</DialogTitle></DialogHeader>
          <form onSubmit={saveTitle} className="space-y-3">
            <div>
              <Label htmlFor="app-title">Title</Label>
              <Input id="app-title" value={draft} onChange={e => setDraft(e.target.value)} placeholder={DEFAULT_TITLE} autoFocus />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
