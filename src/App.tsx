import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { 
  Coffee, 
  ShoppingCart, 
  Package, 
  Users, 
  History, 
  Settings,
  Search,
  Plus,
  Minus,
  Trash2,
  ChevronRight,
  LogOut,
  LayoutDashboard,
  TrendingUp,
  AlertTriangle,
  TrendingDown,
  Clock,
  CheckCircle2,
  Printer,
  Download,
  Pencil,
  Upload,
  Loader2,
  AlertCircle,
  Wallet,
  Receipt,
  LayoutGrid,
  List,
  Banknote,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie
} from "recharts";

type View = "pos" | "inventory" | "loyalty" | "history" | "dashboard" | "expenses";

interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

interface LoyaltyUserRow {
  id: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  loyaltyPoints: number;
  isAdmin: number | boolean;
}

interface ExpenseRow {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: number;
  createdAt?: number;
}

interface OrderLineItem {
  id?: number;
  orderId?: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

interface OrderRow {
  id: string;
  userId: string | null;
  totalAmount: number;
  status: string;
  createdAt: number;
  items?: OrderLineItem[];
}

interface DashboardStats {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue?: number;
  topProducts: { name: string; totalSold: number; category?: string }[];
  categoryDistribution: { name: string; value: number }[];
  lowStockCount: number;
  totalExpenses: number;
  activity: { id: string; user: string; amount: number; time: number; items: string }[];
}

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  imageUrl: string;
  stock: number;
}

/** Normalize API rows (MySQL may return DECIMAL as string). */
function normalizeProduct(raw: unknown): Product | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.name !== "string") return null;
  const price = typeof r.price === "number" ? r.price : parseFloat(String(r.price));
  const stock = typeof r.stock === "number" ? r.stock : parseInt(String(r.stock), 10);
  return {
    id: r.id,
    name: r.name,
    price: Number.isFinite(price) ? price : 0,
    category: typeof r.category === "string" ? r.category : String(r.category ?? ""),
    stock: Number.isFinite(stock) ? Math.max(0, Math.floor(stock)) : 0,
    imageUrl: r.imageUrl == null || r.imageUrl === "" ? "" : String(r.imageUrl),
  };
}

interface CartItem extends Product {
  quantity: number;
}

const SESSION_USER_ID_KEY = "tinto_userId";

function initialsFromUser(displayName: string | null, email: string | null) {
  const s = (displayName || email || "?").trim();
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return s.slice(0, 2).toUpperCase() || "?";
}

function UserAvatar({
  displayName,
  email,
  photoURL,
  className,
}: {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  className?: string;
}) {
  if (photoURL) {
    return <img src={photoURL} alt="" className={className} />;
  }
  return (
    <div
      className={`flex items-center justify-center bg-stone-200 text-xs font-semibold text-stone-700 ${className ?? ""}`}
    >
      {initialsFromUser(displayName, email)}
    </div>
  );
}

export default function App() {
  const [activeView, setActiveView] = useState<View>("pos");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [posViewMode, setPosViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [manualUserId, setManualUserId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const loginPasswordRef = useRef<HTMLInputElement>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const inventoryFirstLoad = useRef(true);
  const [showReceipt, setShowReceipt] = useState<{
    orderId: string;
    items: CartItem[];
    subtotal: number;
    discount: number;
    total: number;
    cashTender?: number;
    change?: number;
  } | null>(null);
  const [isDiscountApplied, setIsDiscountApplied] = useState(false);
  const [cashTenderInput, setCashTenderInput] = useState("");
  const [productCategoryNames, setProductCategoryNames] = useState<string[]>([]);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryModalError, setCategoryModalError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  useEffect(() => {
    if (!settingsOpen) {
      setPwCurrent("");
      setPwNew("");
      setPwConfirm("");
      setPwError(null);
      setPwSuccess(false);
    }
  }, [settingsOpen]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!pwCurrent) {
      setPwError("Enter your current password");
      return;
    }
    if (pwNew.length < 3) {
      setPwError("New password must be at least 3 characters");
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwError("New passwords do not match");
      return;
    }
    setPwError(null);
    setPwLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.uid,
          currentPassword: pwCurrent,
          newPassword: pwNew,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPwError(typeof data.error === "string" ? data.error : "Failed to change password");
        return;
      }
      setPwSuccess(true);
      setPwCurrent("");
      setPwNew("");
      setPwConfirm("");
      setToastMessage("Password updated");
    } catch {
      setPwError("Could not reach server");
    } finally {
      setPwLoading(false);
    }
  };

  useEffect(() => {
    if (!toastMessage) return;
    const t = window.setTimeout(() => setToastMessage(null), 3200);
    return () => window.clearTimeout(t);
  }, [toastMessage]);

  const downloadPosInventoryBackup = async () => {
    setBackupLoading(true);
    try {
      const res = await fetch("/api/backup/catalog");
      if (!res.ok) throw new Error("fail");
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition");
      const match = disp?.match(/filename="([^"]+)"/);
      const name = match?.[1] ?? `cafetinto-pos-inventory-${Date.now()}.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Could not download backup.");
    } finally {
      setBackupLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch("/api/categories");
      const data: unknown = await res.json();
      const names = Array.isArray(data)
        ? (data as { name: string }[]).map((x) => x.name).filter((n) => n && String(n).trim())
        : [];
      setProductCategoryNames(names);
    } catch {
      setProductCategoryNames([]);
    }
  };

  useEffect(() => {
    if (user) void fetchCategories();
    else setProductCategoryNames([]);
  }, [user]);

  useEffect(() => {
    if (cart.length === 0) setCashTenderInput("");
  }, [cart.length]);

  const formCategoryOptions = useMemo(() => {
    const merged = new Set<string>([...productCategoryNames]);
    products.forEach((p) => merged.add(p.category));
    return [...merged].filter((n) => String(n).trim()).sort((a, b) => a.localeCompare(b));
  }, [productCategoryNames, products]);

  const posFilterCategories = useMemo(() => {
    const merged = new Set<string>(["All", ...productCategoryNames]);
    products.forEach((p) => merged.add(p.category));
    const rest = [...merged]
      .filter((c) => c !== "All")
      .sort((a, b) => a.localeCompare(b));
    return ["All", ...rest];
  }, [products, productCategoryNames]);

  useEffect(() => {
    if (activeCategory !== "All" && !posFilterCategories.includes(activeCategory)) {
      setActiveCategory("All");
    }
  }, [posFilterCategories, activeCategory]);

  const fetchProducts = useCallback(async () => {
    const showSpinner = inventoryFirstLoad.current;
    if (showSpinner) setLoading(true);
    try {
      const res = await fetch("/api/inventory");
      const raw: unknown = await res.json();
      if (!res.ok) {
        console.error("Inventory API error", raw);
        setProducts([]);
        return;
      }
      const list = Array.isArray(raw)
        ? (raw.map(normalizeProduct).filter((p): p is Product => p !== null))
        : [];
      setProducts(list);
    } catch (err) {
      console.error("Failed to fetch products", err);
      setProducts([]);
    } finally {
      if (showSpinner) {
        setLoading(false);
        inventoryFirstLoad.current = false;
      }
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    if (activeView === "pos" || activeView === "inventory") {
      void fetchProducts();
    }
  }, [activeView, user, fetchProducts]);

  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_USER_ID_KEY);
    if (!saved) {
      setSessionReady(true);
      return;
    }
    fetch(`/api/auth/session?userId=${encodeURIComponent(saved)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("invalid"))))
      .then((u: { uid: string; email: string | null; displayName: string | null; photoURL: string | null; isAdmin: boolean }) => {
        setUser({
          uid: u.uid,
          email: u.email,
          displayName: u.displayName,
          photoURL: u.photoURL,
        });
        setIsAdmin(Boolean(u.isAdmin));
        fetchProducts();
        setActiveView(u.isAdmin ? "dashboard" : "pos");
      })
      .catch(() => {
        sessionStorage.removeItem(SESSION_USER_ID_KEY);
      })
      .finally(() => setSessionReady(true));
  }, []);

  const signIn = async () => {
    const id = manualUserId.trim();
    if (!id) {
      setLoginError("Enter username or staff ID");
      return;
    }
    if (!loginPassword) {
      setLoginError("Enter your password");
      return;
    }
    setLoginError(null);
    setLoginLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: id, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(typeof data.error === "string" ? data.error : "Sign-in failed");
        return;
      }
      sessionStorage.setItem(SESSION_USER_ID_KEY, data.uid);
      setLoginPassword("");
      setUser({
        uid: data.uid,
        email: data.email ?? null,
        displayName: data.displayName ?? null,
        photoURL: data.photoURL ?? null,
      });
      setIsAdmin(Boolean(data.isAdmin));
      fetchProducts();
      setActiveView(data.isAdmin ? "dashboard" : "pos");
    } catch {
      setLoginError("Could not reach server");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem(SESSION_USER_ID_KEY);
    setUser(null);
    setIsAdmin(false);
    setLoginPassword("");
    setActiveView("pos");
    setProducts([]);
    setProductCategoryNames([]);
    setLoading(true);
    inventoryFirstLoad.current = true;
  };

  const handleAddCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCategoryName.trim();
    if (!name) {
      setCategoryModalError("Ilagay ang pangalan ng category.");
      return;
    }
    setCategoryModalError(null);
    setCategorySaving(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        setCategoryModalError(typeof (data as { error?: string }).error === "string" ? (data as { error: string }).error : "Hindi na-save.");
        return;
      }
      await fetchCategories();
      const created = typeof (data as { name?: string }).name === "string" ? (data as { name: string }).name : name;
      setActiveCategory(created);
      setCategoryModalOpen(false);
      setNewCategoryName("");
    } catch {
      setCategoryModalError("Walang koneksyon sa server.");
    } finally {
      setCategorySaving(false);
    }
  };

  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return products.filter((p) => {
      const matchSearch =
        q === "" ||
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q);
      const matchCategory = activeCategory === "All" || p.category === activeCategory;
      return matchSearch && matchCategory;
    });
  }, [products, searchQuery, activeCategory]);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.max(0, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user?.uid || null,
          items: cart.map((i) => ({ productId: i.id, name: i.name, price: i.price, quantity: i.quantity })),
          totalAmount: total,
        })
      });
      
      if (res.ok) {
        const resData = await res.json();
        const tenderRaw = String(cashTenderInput).replace(/,/g, "").trim();
        const tenderNum = tenderRaw === "" || tenderRaw === "." ? 0 : parseFloat(tenderRaw);
        const tender = Number.isFinite(tenderNum) && tenderNum >= 0 ? tenderNum : 0;
        const changeAmount = tender >= total ? tender - total : undefined;
        const finalReceipt = {
          orderId: resData.id,
          items: [...cart],
          subtotal,
          discount: discountAmount,
          total,
          ...(tender > 0 ? { cashTender: tender } : {}),
          ...(changeAmount !== undefined && tender > 0 ? { change: changeAmount } : {}),
        };
        setCart([]);
        setIsDiscountApplied(false);
        setCashTenderInput("");
        fetchProducts(); // Refresh stock
        setShowReceipt(finalReceipt);
      }
    } catch (err) {
      console.error("Checkout failed", err);
    }
  };

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discountAmount = isDiscountApplied ? subtotal * 0.20 : 0;
  const total = subtotal - discountAmount;

  const tenderAmount = useMemo(() => {
    const raw = String(cashTenderInput).replace(/,/g, "").trim();
    if (raw === "" || raw === ".") return 0;
    const n = parseFloat(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [cashTenderInput]);

  const changeDue = useMemo(() => {
    if (cart.length === 0 || total <= 0) return null;
    if (tenderAmount >= total) return tenderAmount - total;
    return null;
  }, [cart.length, total, tenderAmount]);

  const cashShortage = useMemo(() => {
    if (cart.length === 0 || total <= 0) return null;
    if (tenderAmount > 0 && tenderAmount < total) return total - tenderAmount;
    return null;
  }, [cart.length, total, tenderAmount]);

  const sidebarItems = [
    { id: "dashboard", icon: LayoutDashboard, label: "Dashboard", adminOnly: true },
    { id: "pos", icon: ShoppingCart, label: "POS", adminOnly: false },
    { id: "inventory", icon: Package, label: "Inventory", adminOnly: true },
    { id: "expenses", icon: Wallet, label: "Expenses", adminOnly: true },
    { id: "loyalty", icon: Users, label: "Loyalty", adminOnly: true },
    { id: "history", icon: History, label: "History", adminOnly: false },
  ];

  if (!sessionReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-200 border-t-stone-800" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden p-4 sm:p-6">
        <div className="pointer-events-none absolute inset-0 -z-20 overflow-hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className="absolute inset-0"
          >
            <motion.div
              aria-hidden
              className="absolute left-1/2 top-1/2 min-h-[120%] min-w-[120%] -translate-x-1/2 -translate-y-1/2 bg-cover bg-center will-change-transform"
              style={{
                backgroundImage: "url(/login-bg.png)",
                transformOrigin: "50% 45%",
              }}
              initial={{ scale: 1.06, x: "0%", y: "0%" }}
              animate={{
                scale: [1.06, 1.14, 1.08, 1.12, 1.06],
                x: ["0%", "-1.2%", "0.8%", "-0.4%", "0%"],
                y: ["0%", "0.6%", "-0.5%", "0.4%", "0%"],
              }}
              transition={{
                duration: 48,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          </motion.div>
        </div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.9 }}
          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-stone-950/65 via-stone-900/45 to-stone-950/75"
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          initial={{ opacity: 0.28 }}
          animate={{ opacity: [0.26, 0.48, 0.3, 0.44, 0.26] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          style={{
            background:
              "radial-gradient(ellipse 58% 40% at 50% 16%, rgba(251,191,36,0.28), transparent 72%)",
          }}
        />

        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.6, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.55, ease: "backOut" }}
            className="absolute left-1/2 -top-8 z-10 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-700 to-stone-900 text-white shadow-xl ring-1 ring-white/30"
          >
            <Coffee size={30} strokeWidth={1.75} />
          </motion.div>

          <div className="overflow-hidden rounded-2xl border border-white/20 bg-white/10 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] backdrop-blur-2xl backdrop-saturate-150">
            <div className="px-7 pt-12 pb-7 sm:px-8">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.4 }}
                className="mb-7 text-center"
              >
                <h1 className="text-2xl font-semibold tracking-tight text-white drop-shadow-sm">Café Tinto</h1>
                <p className="mt-1.5 text-[13px] text-stone-100/75">
                  Welcome back · sign in to continue
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.4 }}
                className="space-y-4"
              >
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-stone-100/70">
                    Username
                  </label>
                  <input
                    type="text"
                    value={manualUserId}
                    onChange={(e) => setManualUserId(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        loginPasswordRef.current?.focus();
                      }
                    }}
                    placeholder="admin or staff ID"
                    className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white placeholder-stone-200/50 shadow-inner backdrop-blur transition-all focus:border-amber-200/40 focus:bg-white/15 focus:outline-none focus:ring-2 focus:ring-amber-200/30"
                    autoComplete="username"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-stone-100/70">
                    Password
                  </label>
                  <input
                    ref={loginPasswordRef}
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void signIn()}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white placeholder-stone-200/50 shadow-inner backdrop-blur transition-all focus:border-amber-200/40 focus:bg-white/15 focus:outline-none focus:ring-2 focus:ring-amber-200/30"
                    autoComplete="current-password"
                  />
                </div>

                <motion.button
                  type="button"
                  disabled={loginLoading}
                  onClick={() => void signIn()}
                  whileHover={{ scale: 1.015 }}
                  whileTap={{ scale: 0.985 }}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-amber-600 to-stone-900 px-4 py-2.5 text-sm font-semibold text-white shadow-lg ring-1 ring-white/15 transition-all hover:from-amber-500 hover:to-stone-800 disabled:opacity-60"
                >
                  {loginLoading ? (
                    <Loader2 size={16} className="animate-spin" strokeWidth={2} />
                  ) : (
                    <>
                      Sign in
                      <ChevronRight size={16} strokeWidth={2.25} />
                    </>
                  )}
                </motion.button>
              </motion.div>

              <AnimatePresence>
                {loginError && (
                  <motion.p
                    key="login-error"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-center text-xs text-red-200"
                  >
                    {loginError}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <div className="border-t border-white/10 bg-black/20 px-7 py-3 text-center sm:px-8">
              <p className="text-[11px] text-stone-200/60">
                Café Tinto POS · brewed with care
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-stone-50 font-sans text-stone-900 antialiased">
      <aside className="flex w-[4.5rem] shrink-0 flex-col border-r border-stone-200 bg-white py-6 lg:w-56">
        <div className="flex items-center justify-center gap-2 px-3 lg:justify-start lg:px-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-900 text-white">
            <Coffee size={18} strokeWidth={1.75} />
          </div>
          <span className="hidden text-sm font-semibold tracking-tight text-stone-900 lg:inline">Café Tinto</span>
        </div>
        <nav className="mt-8 flex flex-1 flex-col gap-0.5 px-2">
          {sidebarItems.map((item) => {
            if (item.adminOnly && !isAdmin) return null;
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id as View)}
                className={`flex items-center justify-center gap-3 rounded-lg py-2.5 transition-colors lg:justify-start lg:px-3 ${
                  isActive
                    ? "bg-stone-900 text-white"
                    : "text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                }`}
              >
                <Icon size={18} strokeWidth={1.75} />
                <span className="hidden text-sm font-medium lg:inline">{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="px-2 pb-2">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex w-full items-center justify-center gap-3 rounded-lg py-2.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 lg:justify-start lg:px-3"
          >
            <Settings size={18} strokeWidth={1.75} />
            <span className="hidden text-sm font-medium lg:inline">Settings</span>
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row">
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-stone-200 bg-white px-4 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
            <div className="relative min-w-0 flex-1 max-w-full md:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} strokeWidth={1.75} />
              <input
                type="text"
                placeholder="Search products…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-stone-200 bg-stone-50 py-2 pl-9 pr-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-900/10"
              />
            </div>
            {activeView === "pos" && (
              <div className="flex rounded-lg border border-stone-200 bg-stone-50 p-0.5">
                <button
                  type="button"
                  onClick={() => setPosViewMode("grid")}
                  className={`rounded-md p-2 transition-colors ${posViewMode === "grid" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"}`}
                  aria-pressed={posViewMode === "grid"}
                >
                  <LayoutGrid size={16} strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  onClick={() => setPosViewMode("list")}
                  className={`rounded-md p-2 transition-colors ${posViewMode === "list" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"}`}
                  aria-pressed={posViewMode === "list"}
                >
                  <List size={16} strokeWidth={1.75} />
                </button>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-stone-900">{user.displayName}</p>
              <p className="text-xs text-stone-500">{isAdmin ? "Admin" : "Staff"}</p>
            </div>
            <div className="group relative h-9 w-9 overflow-hidden rounded-lg border border-stone-200">
              <UserAvatar
                displayName={user.displayName}
                email={user.email}
                photoURL={user.photoURL}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={handleLogout}
                className="absolute inset-0 flex items-center justify-center bg-stone-900/85 text-white opacity-0 transition-opacity group-hover:opacity-100"
                title="Sign out"
              >
                <LogOut size={16} strokeWidth={1.75} />
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="mx-auto max-w-7xl">
            {activeView === "dashboard" && <DashboardView />}
            {activeView === "pos" && (
              <div className="flex flex-col gap-8">
                {loading ? (
                  <div className="flex items-center justify-center py-24">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-200 border-t-stone-800" />
                  </div>
                ) : products.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-stone-200 bg-white p-16 text-center">
                    <p className="text-sm text-stone-500">No products in inventory.</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-2 pb-2">
                      <div className="scrollbar-hide flex min-w-0 flex-1 gap-2 overflow-x-auto">
                        {posFilterCategories.map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setActiveCategory(cat)}
                            className={`shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                              activeCategory === cat
                                ? "bg-stone-900 text-white"
                                : "border border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setCategoryModalOpen(true);
                          setNewCategoryName("");
                          setCategoryModalError(null);
                        }}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:border-stone-900 hover:bg-stone-50"
                      >
                        <Plus size={14} strokeWidth={1.75} />
                        Add category
                      </button>
                    </div>
                    <POSView products={filteredProducts} onAddToCart={addToCart} viewMode={posViewMode} />
                  </>
                )}
              </div>
            )}
            {activeView === "inventory" && (
              <InventoryView
                products={products}
                onRefresh={fetchProducts}
                filterCategoryOptions={posFilterCategories}
                formCategoryOptions={formCategoryOptions}
                selectedCategory={activeCategory}
                onSelectCategory={setActiveCategory}
                onOpenAddCategory={() => {
                  setCategoryModalOpen(true);
                  setNewCategoryName("");
                  setCategoryModalError(null);
                }}
              />
            )}
            {activeView === "expenses" && <ExpensesView />}
            {activeView === "loyalty" && <LoyaltyView />}
            {activeView === "history" && <HistoryView userId={user?.uid || "all"} />}
          </div>
        </div>
      </main>

      {activeView === "pos" && (
        <aside className="flex max-h-[min(42vh,22rem)] w-full shrink-0 flex-col border-t border-stone-200 bg-white md:max-h-none md:h-auto md:w-[300px] md:border-l md:border-t-0 lg:w-[320px]">
          <div className="border-b border-stone-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-stone-900">Current order</h2>
          </div>

          <div className="scrollbar-hide flex flex-1 flex-col gap-2 overflow-auto p-4">
            {cart.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-stone-400">
                <ShoppingCart size={32} strokeWidth={1.25} />
                <p className="text-xs text-stone-500">Cart is empty</p>
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-3 rounded-xl border border-stone-100 bg-stone-50/50 p-3 transition-colors hover:border-stone-200"
                >
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Package className="text-stone-300" size={20} strokeWidth={1.5} />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words text-sm font-medium leading-snug text-stone-900">{item.name}</h3>
                    <p className="text-xs text-stone-500">₱{item.price.toFixed(2)}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, -1)}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-600 hover:bg-stone-100"
                      >
                        <Minus size={14} strokeWidth={1.75} />
                      </button>
                      <span className="w-6 text-center text-xs font-medium tabular-nums">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-600 hover:bg-stone-100"
                      >
                        <Plus size={14} strokeWidth={1.75} />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col items-end justify-between">
                    <span className="text-sm font-medium tabular-nums text-stone-900">₱{(item.price * item.quantity).toFixed(2)}</span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.id, -item.quantity)}
                      className="rounded-md p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="Remove"
                    >
                      <Trash2 size={14} strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-stone-100 p-4">
            <div className="mb-4 flex items-center justify-between text-sm text-stone-600">
              <span>Subtotal</span>
              <span className="font-medium tabular-nums text-stone-900">₱{subtotal.toFixed(2)}</span>
            </div>
            <button
              type="button"
              onClick={() => setIsDiscountApplied(!isDiscountApplied)}
              className={`mb-4 flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                isDiscountApplied
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
              }`}
            >
              <span className="flex items-center gap-2">
                <TrendingDown size={16} strokeWidth={1.75} className="shrink-0 opacity-70" />
                {isDiscountApplied ? "20% discount on" : "Apply 20% discount"}
              </span>
              {isDiscountApplied && <span className="text-sm font-medium tabular-nums">−₱{discountAmount.toFixed(2)}</span>}
            </button>
            <div className="mb-4 flex items-center justify-between border-t border-stone-100 pt-4">
              <span className="text-sm text-stone-500">Total</span>
              <span className="text-lg font-semibold tabular-nums text-stone-900">₱{total.toFixed(2)}</span>
            </div>
            {cart.length > 0 && (
              <div className="mb-4 space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-stone-500">
                  <Banknote size={14} strokeWidth={1.75} className="text-stone-400" />
                  Cash received
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-stone-400">
                    ₱
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={cashTenderInput}
                    onChange={(e) => setCashTenderInput(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-stone-200 bg-stone-50 py-2 pl-7 pr-3 text-sm tabular-nums text-stone-900 placeholder:text-stone-400 focus:border-stone-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-900/10"
                  />
                </div>
                {tenderAmount > 0 && changeDue !== null && (
                  <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                    <span className="text-sm font-medium text-emerald-900">Change (sukli)</span>
                    <span className="text-sm font-semibold tabular-nums text-emerald-900">₱{changeDue.toFixed(2)}</span>
                  </div>
                )}
                {cashShortage !== null && (
                  <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    <span className="text-sm font-medium text-amber-900">Kulang</span>
                    <span className="text-sm font-semibold tabular-nums text-amber-900">₱{cashShortage.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              disabled={cart.length === 0}
              onClick={handleCheckout}
              className={`flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-medium transition-colors ${
                cart.length === 0
                  ? "cursor-not-allowed bg-stone-100 text-stone-400"
                  : "bg-stone-900 text-white hover:bg-stone-800"
              }`}
            >
              Checkout
              <ChevronRight size={16} strokeWidth={1.75} />
            </button>
          </div>
        </aside>
      )}
      </div>

      <AnimatePresence>
        {categoryModalOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
              onClick={() => {
                if (!categorySaving) setCategoryModalOpen(false);
              }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              className="relative z-10 w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 shadow-lg"
            >
              <h3 className="text-lg font-semibold text-stone-900">Add category</h3>
              <p className="mt-1 text-sm text-stone-500">Maidaragdag sa filter at sa dropdown ng bagong produkto.</p>
              <form onSubmit={handleAddCategorySubmit} className="mt-4 flex flex-col gap-3">
                <input
                  autoFocus
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Category name"
                  className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm focus:border-stone-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-900/10"
                />
                {categoryModalError && <p className="text-sm text-red-600">{categoryModalError}</p>}
                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={categorySaving}
                    className="flex-1 rounded-lg bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
                  >
                    {categorySaving ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    disabled={categorySaving}
                    onClick={() => setCategoryModalOpen(false)}
                    className="rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {settingsOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
              onClick={() => !backupLoading && setSettingsOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              className="relative z-10 flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-lg"
            >
              <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4">
                <div className="flex items-center gap-2">
                  <Settings size={18} strokeWidth={1.75} className="text-stone-500" />
                  <h3 className="text-base font-semibold text-stone-900">Settings</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  disabled={backupLoading || pwLoading}
                  className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-50"
                  aria-label="Close settings"
                >
                  <span className="text-lg leading-none">×</span>
                </button>
              </div>

              <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
                <section>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Account
                  </h4>
                  <div className="flex items-center gap-3 rounded-xl border border-stone-100 bg-stone-50/60 p-3">
                    <UserAvatar
                      displayName={user?.displayName ?? null}
                      email={user?.email ?? null}
                      photoURL={user?.photoURL ?? null}
                      className="h-10 w-10 shrink-0 rounded-lg object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-stone-900">
                        {user?.displayName || user?.uid || "—"}
                      </p>
                      <p className="truncate text-xs text-stone-500">
                        {user?.uid}
                        {isAdmin ? " · Admin" : " · Staff"}
                      </p>
                    </div>
                  </div>
                </section>

                <section>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Change password
                  </h4>
                  <form onSubmit={handleChangePassword} className="space-y-2.5">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-stone-500">
                        Current password
                      </label>
                      <input
                        type="password"
                        value={pwCurrent}
                        onChange={(e) => {
                          setPwCurrent(e.target.value);
                          setPwError(null);
                          setPwSuccess(false);
                        }}
                        autoComplete="current-password"
                        className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm focus:border-stone-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-900/10"
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-stone-500">
                          New password
                        </label>
                        <input
                          type="password"
                          value={pwNew}
                          onChange={(e) => {
                            setPwNew(e.target.value);
                            setPwError(null);
                            setPwSuccess(false);
                          }}
                          autoComplete="new-password"
                          className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm focus:border-stone-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-900/10"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-stone-500">
                          Confirm new
                        </label>
                        <input
                          type="password"
                          value={pwConfirm}
                          onChange={(e) => {
                            setPwConfirm(e.target.value);
                            setPwError(null);
                            setPwSuccess(false);
                          }}
                          autoComplete="new-password"
                          className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm focus:border-stone-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-900/10"
                        />
                      </div>
                    </div>
                    {pwError && (
                      <p className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
                        {pwError}
                      </p>
                    )}
                    {pwSuccess && !pwError && (
                      <p className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-700">
                        Password updated successfully.
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={pwLoading}
                      className="inline-flex items-center gap-2 rounded-lg bg-stone-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
                    >
                      {pwLoading && <Loader2 className="animate-spin" size={14} strokeWidth={2} />}
                      {pwLoading ? "Updating…" : "Update password"}
                    </button>
                  </form>
                </section>

                <section>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Data &amp; backup
                  </h4>
                  <p className="mb-3 text-xs leading-relaxed text-stone-500">
                    Export products and categories as JSON for a quick backup. Inventory and orders
                    save to your configured database.
                  </p>
                  <button
                    type="button"
                    disabled={backupLoading}
                    onClick={downloadPosInventoryBackup}
                    className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                  >
                    {backupLoading ? (
                      <Loader2 className="animate-spin" size={14} strokeWidth={2} />
                    ) : (
                      <Download size={14} strokeWidth={1.75} />
                    )}
                    {backupLoading ? "Preparing…" : "Download JSON backup"}
                  </button>
                </section>

                <section>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Session
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      setSettingsOpen(false);
                      handleLogout();
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                  >
                    <LogOut size={14} strokeWidth={1.75} />
                    Sign out
                  </button>
                </section>
              </div>

              <div className="border-t border-stone-100 bg-stone-50/60 px-6 py-3 text-right">
                <button
                  type="button"
                  disabled={backupLoading || pwLoading}
                  onClick={() => setSettingsOpen(false)}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-50"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Receipt Modal */}
      <AnimatePresence>
        {showReceipt && (
          <ReceiptModal
            orderId={showReceipt.orderId}
            items={showReceipt.items}
            subtotal={showReceipt.subtotal}
            discount={showReceipt.discount}
            total={showReceipt.total}
            cashTender={showReceipt.cashTender}
            change={showReceipt.change}
            onClose={() => setShowReceipt(null)}
            onSaved={() => {
              setShowReceipt(null);
              setToastMessage("Successfully saved");
              setActiveView("history");
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toastMessage && (
          <motion.div
            key={toastMessage}
            role="status"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="pointer-events-none fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-xl border border-emerald-200/80 bg-white px-4 py-3 text-sm font-medium text-emerald-900 shadow-lg shadow-stone-900/10"
          >
            <CheckCircle2 className="shrink-0 text-emerald-600" size={18} strokeWidth={2} />
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function POSView(
  { products, onAddToCart, viewMode }: { products: Product[]; onAddToCart: (p: Product) => void; viewMode: "grid" | "list" }
) {
  if (viewMode === "list") {
    return (
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50/80 text-xs font-medium text-stone-500">
              <th className="whitespace-nowrap px-4 py-3 sm:px-6">Product</th>
              <th className="hidden whitespace-nowrap px-4 py-3 sm:table-cell sm:px-6">Category</th>
              <th className="whitespace-nowrap px-4 py-3 sm:px-6">Price</th>
              <th className="hidden whitespace-nowrap px-4 py-3 md:table-cell md:px-6">Stock</th>
              <th className="px-4 py-3 text-right sm:px-6" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {products.map((p) => (
              <tr
                key={p.id}
                onClick={() => onAddToCart(p)}
                className="group cursor-pointer transition-colors hover:bg-stone-50"
              >
                <td className="px-4 py-3 sm:px-6">
                  <div className="flex items-start gap-3">
                    <div className="relative mt-0.5 h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Package className="text-stone-300" size={20} strokeWidth={1.5} />
                        </div>
                      )}
                    </div>
                    <span className="min-w-0 max-w-[12rem] flex-1 break-words text-sm font-medium leading-snug text-stone-900 sm:max-w-md">
                      {p.name}
                    </span>
                  </div>
                </td>
                <td className="hidden px-4 py-3 sm:table-cell sm:px-6">
                  <span className="rounded-md bg-stone-100 px-2 py-0.5 text-xs text-stone-600">{p.category}</span>
                </td>
                <td className="px-4 py-3 font-medium tabular-nums text-stone-900 sm:px-6">₱{p.price.toFixed(2)}</td>
                <td className="hidden px-4 py-3 md:table-cell md:px-6">
                  <div className="flex items-center gap-2 text-xs text-stone-500">
                    <span className={`h-1.5 w-1.5 rounded-full ${p.stock < 15 ? "bg-red-500" : "bg-emerald-500"}`} />
                    {p.stock}
                  </div>
                </td>
                <td className="px-4 py-3 text-right sm:px-6">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 text-stone-600 transition-colors group-hover:border-stone-900 group-hover:bg-stone-900 group-hover:text-white">
                    <Plus size={16} strokeWidth={1.75} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((product) => (
        <motion.button
          type="button"
          key={product.id}
          layout
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          onClick={() => onAddToCart(product)}
          className="group flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white text-left transition-colors hover:border-stone-300"
        >
          <div className="relative aspect-square w-full overflow-hidden bg-stone-100">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-[1.02]"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <Package className="text-stone-300" size={40} strokeWidth={1.5} />
              </div>
            )}
            {product.stock < 15 && (
              <span className="absolute right-2 top-2 rounded-md bg-red-600 px-2 py-0.5 text-[10px] font-medium text-white">
                Low · {product.stock}
              </span>
            )}
          </div>
          <div className="flex items-start justify-between gap-2 p-3">
            <div className="min-w-0 flex-1 pr-1">
              <h3 className="break-words text-sm font-medium leading-snug text-stone-900">{product.name}</h3>
              <p className="mt-1 text-sm tabular-nums text-stone-600">₱{product.price.toFixed(2)}</p>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-stone-200 text-stone-500 transition-colors group-hover:border-stone-900 group-hover:bg-stone-900 group-hover:text-white">
              <Plus size={16} strokeWidth={1.75} />
            </span>
          </div>
        </motion.button>
      ))}
    </div>
  );
}

function InventoryView({
  products,
  onRefresh,
  filterCategoryOptions,
  formCategoryOptions,
  selectedCategory,
  onSelectCategory,
  onOpenAddCategory,
}: {
  products: Product[];
  onRefresh: () => void;
  filterCategoryOptions: string[];
  formCategoryOptions: string[];
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
  onOpenAddCategory: () => void;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [form, setForm] = useState({ name: "", category: "", price: 0, stock: 0, imageUrl: "" });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (data.url) {
        setForm(prev => ({ ...prev, imageUrl: data.url }));
      }
    } catch (err) {
      console.error("Upload failed", err);
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    if (editingProduct) {
      setForm({
        name: editingProduct.name,
        category: editingProduct.category,
        price: editingProduct.price,
        stock: editingProduct.stock,
        imageUrl: editingProduct.imageUrl || "",
      });
    } else {
      setForm({
        name: "",
        category: formCategoryOptions[0] || "",
        price: 0,
        stock: 0,
        imageUrl: "",
      });
    }
  }, [editingProduct, formCategoryOptions]);

  const filteredItems = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || 
                         p.category.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === "All" || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!String(form.category).trim()) {
      alert("Pumili o magdagdag muna ng category.");
      return;
    }
    try {
      const url = editingProduct ? `/api/inventory/${editingProduct.id}` : "/api/inventory";
      const method = editingProduct ? "PUT" : "POST";
      
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      
      if (res.ok) {
        setIsModalOpen(false);
        setEditingProduct(null);
        onRefresh();
      }
    } catch (err) {
      console.error("Failed to save product", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this product?")) return;
    try {
      const res = await fetch(`/api/inventory/${id}`, { method: "DELETE" });
      if (res.ok) onRefresh();
    } catch (err) {
      console.error("Failed to delete product", err);
    }
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim() !== '');
      if (lines.length < 2) {
        alert("CSV file must have a header row and at least one data row.");
        return;
      }

      const header = lines[0].split(',').map(h => h.trim().toLowerCase());
      const data = lines.slice(1).map((line) => {
        const values = line.split(",").map((v) => v.trim());
        const obj: Record<string, string | number> = {};
        header.forEach((h, i) => {
          if (h === "price" || h === "stock") {
            obj[h] = parseFloat(values[i]) || 0;
          } else {
            obj[h] = values[i] || "";
          }
        });
        return obj;
      });

      try {
        const res = await fetch("/api/inventory/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data)
        });
        if (res.ok) {
          onRefresh();
          alert("Bulk upload successful!");
        } else {
          const errData = await res.json();
          alert(`Error: ${errData.error || "Failed to upload"}`);
        }
      } catch (err) {
        console.error("Bulk upload failed", err);
        alert("Failed to upload products. Please check the file format (CSV with header: name,category,price,stock,imageUrl).");
      }
    };
    reader.readAsText(file);
  };

  const handleExportCSV = () => {
    const header = ["name", "category", "price", "stock", "imageUrl"];
    const rows = products.map(p => [
      p.name,
      p.category,
      p.price,
      p.stock,
      p.imageUrl || ""
    ]);

    const csvContent = [
      header.join(","),
      ...rows.map(r => r.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "tinto_inventory_export.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-stone-900">Inventory</h2>
          <p className="text-sm text-stone-500">Products and stock</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50"
          >
            <Download size={16} strokeWidth={1.75} />
            Export CSV
          </button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50">
            <Upload size={16} strokeWidth={1.75} />
            Import CSV
            <input type="file" accept=".csv" className="hidden" onChange={handleBulkUpload} />
          </label>
          <button
            type="button"
            onClick={() => {
              setEditingProduct(null);
              setIsModalOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
          >
            <Plus size={16} strokeWidth={1.75} />
            Add product
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <div className="border-b border-stone-100 p-4 sm:p-5">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} strokeWidth={1.75} />
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-stone-200 bg-stone-50 py-2 pl-9 pr-3 text-sm focus:border-stone-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-900/10"
            />
          </div>
          <div className="mt-3 flex items-start gap-2">
            <div className="scrollbar-hide flex min-w-0 flex-1 gap-2 overflow-x-auto">
              {filterCategoryOptions.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => onSelectCategory(cat)}
                  className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    selectedCategory === cat
                      ? "bg-stone-900 text-white"
                      : "border border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onOpenAddCategory}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-700 hover:border-stone-900 hover:bg-stone-50"
            >
              <Plus size={14} strokeWidth={1.75} />
              Add category
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-stone-100 bg-stone-50/80 text-xs font-medium text-stone-500">
                <th className="px-4 py-3 sm:px-6">Product</th>
                <th className="px-4 py-3 sm:px-6">Category</th>
                <th className="px-4 py-3 sm:px-6">Price</th>
                <th className="px-4 py-3 sm:px-6">Stock</th>
                <th className="px-4 py-3 text-right sm:px-6">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center text-sm text-stone-500">
                    No products match your search.
                  </td>
                </tr>
              ) : (
                filteredItems.map((p) => (
                  <tr key={p.id} className="group transition-colors hover:bg-stone-50/80">
                    <td className="px-4 py-3 sm:px-6">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-stone-200 bg-stone-50">
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Package className="text-stone-300" size={20} strokeWidth={1.5} />
                          )}
                        </div>
                        <span className="font-medium text-stone-900">{p.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 sm:px-6">
                      <span className="rounded-md bg-stone-100 px-2 py-0.5 text-xs text-stone-600">{p.category}</span>
                    </td>
                    <td className="px-4 py-3 font-medium tabular-nums text-stone-900 sm:px-6">₱{p.price.toFixed(2)}</td>
                    <td className="px-4 py-3 sm:px-6">
                      <div className="flex max-w-[10rem] flex-col gap-1.5">
                        <div className="flex items-center gap-2 text-xs text-stone-500">
                          <span className={p.stock < 15 ? "font-medium text-red-600" : ""}>{p.stock}</span>
                          {p.stock < 15 && <AlertCircle size={12} className="text-red-500" />}
                        </div>
                        <div className="h-1 overflow-hidden rounded-full bg-stone-200">
                          <div
                            className={`h-full rounded-full ${p.stock < 15 ? "bg-red-500" : p.stock < 50 ? "bg-amber-500" : "bg-emerald-600"}`}
                            style={{ width: `${Math.min(100, (p.stock / 100) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right sm:px-6">
                      <div className="flex justify-end gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingProduct(p);
                            setIsModalOpen(true);
                          }}
                          className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                        >
                          <Pencil size={16} strokeWidth={1.75} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(p.id)}
                          className="rounded-lg p-2 text-stone-500 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={16} strokeWidth={1.75} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsModalOpen(false);
                setEditingProduct(null);
              }}
              className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-lg"
            >
              <div className="p-6 sm:p-8">
                <h3 className="mb-6 text-lg font-semibold text-stone-900">{editingProduct ? "Edit product" : "New product"}</h3>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-stone-500">Name</label>
                    <input
                      required
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm focus:border-stone-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-900/10"
                      placeholder="Product name"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-stone-500">Category</label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm focus:border-stone-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-900/10"
                    >
                      {form.category && !formCategoryOptions.includes(form.category) && (
                        <option value={form.category}>{form.category}</option>
                      )}
                      {formCategoryOptions.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-stone-500">Price (₱)</label>
                      <input
                        required
                        type="number"
                        step="0.01"
                        value={form.price}
                        onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) })}
                        className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm focus:border-stone-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-900/10"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-stone-500">Stock</label>
                      <input
                        required
                        type="number"
                        value={form.stock}
                        onChange={(e) => setForm({ ...form, stock: parseInt(e.target.value, 10) })}
                        className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm focus:border-stone-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-900/10"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-stone-500">Image</label>
                    <div className="flex items-center gap-3">
                      <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-stone-200 bg-stone-50">
                        {form.imageUrl ? (
                          <img src={form.imageUrl} className="h-full w-full object-cover" alt="" />
                        ) : (
                          <Upload size={20} className="text-stone-300" strokeWidth={1.5} />
                        )}
                        {isUploading && (
                          <div className="absolute inset-0 flex items-center justify-center bg-white/90">
                            <Loader2 className="h-5 w-5 animate-spin text-stone-700" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleFileUpload}
                          className="block w-full cursor-pointer text-xs text-stone-500 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-stone-900 file:px-3 file:py-2 file:text-xs file:font-medium file:text-white hover:file:bg-stone-800"
                        />
                        <p className="mt-1 text-xs text-stone-400">JPEG or PNG</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="submit"
                      className="flex-1 rounded-lg bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-800"
                    >
                      {editingProduct ? "Save" : "Create"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsModalOpen(false);
                        setEditingProduct(null);
                      }}
                      className="rounded-lg border border-stone-200 px-5 py-2.5 text-sm font-medium text-stone-600 hover:bg-stone-50"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LoyaltyView() {
  const [users, setUsers] = useState<LoyaltyUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/loyalty");
      const data: unknown = await res.json();
      setUsers(Array.isArray(data) ? (data as LoyaltyUserRow[]) : []);
    } catch (err) {
      console.error("Failed to fetch users", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMember = async (id: string) => {
    if (!confirm("Are you sure you want to remove this member?")) return;
    try {
      const res = await fetch(`/api/loyalty/${id}`, { method: "DELETE" });
      if (res.ok) fetchUsers();
    } catch (err) {
      console.error("Failed to delete member", err);
    }
  };

  const q = search.toLowerCase();
  const filtered = users.filter(
    (u) =>
      u.displayName?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q)
  );

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <div className="flex flex-col justify-between gap-4 border-b border-stone-100 p-5 sm:flex-row sm:items-center sm:p-6">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-stone-900">Loyalty</h2>
          <p className="text-sm text-stone-500">Members and points</p>
        </div>
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} strokeWidth={1.75} />
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-stone-200 bg-stone-50 py-2 pl-9 pr-3 text-sm focus:border-stone-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-900/10"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50/80 text-xs font-medium text-stone-500">
              <th className="px-4 py-3 sm:px-6">Member</th>
              <th className="px-4 py-3 sm:px-6">Role</th>
              <th className="px-4 py-3 sm:px-6">Points</th>
              <th className="px-4 py-3 text-right sm:px-6" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {loading ? (
              <tr>
                <td colSpan={4} className="py-16 text-center">
                  <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-stone-200 border-t-stone-800" />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-16 text-center text-sm text-stone-500">
                  No members yet.
                </td>
              </tr>
            ) : (
              filtered.map((u) => (
                <tr key={u.id} className="group transition-colors hover:bg-stone-50/80">
                  <td className="px-4 py-4 sm:px-6">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-stone-200 bg-stone-50">
                        <UserAvatar
                          displayName={u.displayName}
                          email={u.email}
                          photoURL={u.photoURL}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-stone-900">{u.displayName || u.email || u.id}</p>
                        <p className="truncate text-xs text-stone-500">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 sm:px-6">
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${
                        Boolean(u.isAdmin) ? "bg-stone-900 text-white" : "border border-emerald-200 bg-emerald-50 text-emerald-800"
                      }`}
                    >
                      {Boolean(u.isAdmin) ? "Admin" : "Member"}
                    </span>
                  </td>
                  <td className="px-4 py-4 font-medium tabular-nums text-stone-900 sm:px-6">
                    {(u.loyaltyPoints || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-4 text-right sm:px-6">
                    <button
                      type="button"
                      onClick={() => handleDeleteMember(u.id)}
                      className="rounded-lg p-2 text-stone-400 hover:bg-red-50 hover:text-red-600 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100"
                    >
                      <Trash2 size={16} strokeWidth={1.75} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DashboardView() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"today" | "week" | "month">("today");

  useEffect(() => {
    fetchStats();
  }, [period]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics/stats?period=${period}`);
      const data: unknown = await res.json();
      setStats(data as DashboardStats);
    } catch (err) {
      console.error("Failed to fetch stats", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !stats) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-200 border-t-stone-800" />
        <p className="text-sm text-stone-500">Loading…</p>
      </div>
    );
  }

  const netProfit = stats.totalRevenue - (stats.totalExpenses || 0);

  const avgOrder = stats.totalOrders > 0 ? stats.totalRevenue / stats.totalOrders : 0;
  const statCards = [
    {
      title: "Revenue",
      value: `₱${stats.totalRevenue.toFixed(2)}`,
      icon: TrendingUp,
      color: "bg-emerald-500",
      subtitle: `${stats.totalOrders} orders · avg ₱${avgOrder.toFixed(2)}`,
    },
    {
      title: "Expenses",
      value: `₱${(stats.totalExpenses || 0).toFixed(2)}`,
      icon: TrendingDown,
      color: "bg-rose-500",
      subtitle: "Same period",
    },
    {
      title: "Net profit",
      value: `₱${netProfit.toFixed(2)}`,
      icon: Wallet,
      color: netProfit >= 0 ? "bg-emerald-600" : "bg-red-600",
      subtitle: "Revenue − expenses",
    },
    {
      title: "Orders",
      value: stats.totalOrders.toLocaleString(),
      icon: ShoppingCart,
      color: "bg-stone-800",
      subtitle: "In selected period",
    },
    {
      title: "Low stock",
      value: String(stats.lowStockCount),
      icon: AlertTriangle,
      color: stats.lowStockCount > 10 ? "bg-red-500" : stats.lowStockCount > 0 ? "bg-orange-500" : "bg-emerald-500",
      subtitle: "Products below threshold",
    },
  ];

  const COLORS = [
    "#f59e0b", // amber
    "#10b981", // emerald
    "#3b82f6", // blue
    "#ec4899", // pink
    "#8b5cf6", // violet
    "#ef4444", // red
    "#14b8a6", // teal
    "#f97316", // orange
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-stone-900">Dashboard</h2>
          <p className="text-sm text-stone-500">Overview for the selected period</p>
        </div>
        <div className="flex w-fit rounded-lg border border-stone-200 bg-white p-0.5">
          {(["today", "week", "month"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-md px-4 py-2 text-xs font-medium capitalize transition-colors ${
                period === p ? "bg-stone-900 text-white" : "text-stone-500 hover:bg-stone-50 hover:text-stone-900"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {statCards.map((card, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4"
          >
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg text-white ${card.color}`}>
              <card.icon size={18} strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-xs text-stone-500">{card.title}</p>
              <h3 className="mt-0.5 text-lg font-semibold tabular-nums text-stone-900">{card.value}</h3>
            </div>
            <p className="text-xs text-stone-400">{card.subtitle}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <div className="flex flex-col gap-6 rounded-xl border border-stone-200 bg-white p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-stone-900">Best sellers</h3>
                <p className="text-xs text-stone-500">By units sold</p>
              </div>
              <div className="rounded-lg border border-stone-100 bg-stone-50 p-2 text-stone-600">
                <Package size={18} strokeWidth={1.75} />
              </div>
            </div>
            
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.topProducts}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#78716c", fontSize: 11, fontWeight: 500 }}
                    dy={10}
                  />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "#78716c", fontSize: 11, fontWeight: 500 }} />
                  <Tooltip
                    cursor={{ fill: "transparent" }}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e7e5e4",
                      boxShadow: "0 4px 12px rgb(0 0 0 / 0.06)",
                      padding: "10px 12px",
                    }}
                  />
                  <Bar dataKey="totalSold" name="Quantity" radius={[6, 6, 0, 0]} barSize={32}>
                    {stats.topProducts.map((_: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 items-center gap-8 rounded-xl border border-stone-200 bg-white p-6 md:grid-cols-2">
            <div className="h-[220px] sm:h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.categoryDistribution}
                    innerRadius={64}
                    outerRadius={88}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {stats.categoryDistribution.map((_: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e7e5e4",
                      boxShadow: "0 4px 12px rgb(0 0 0 / 0.06)",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-stone-900">By category</h4>
              <div className="space-y-3">
                {stats.categoryDistribution.map((cat: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-stone-600">{cat.name}</span>
                    </div>
                    <span className="font-medium tabular-nums text-stone-900">₱{cat.value.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col rounded-xl border border-stone-200 bg-white text-stone-900">
          <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
            <h3 className="text-sm font-semibold text-stone-900">Recent activity</h3>
            <span className="text-xs text-stone-500">Live</span>
          </div>
          <div className="scrollbar-hide max-h-[min(520px,55vh)] flex-1 space-y-4 overflow-y-auto p-5">
            {stats.activity.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-stone-400">
                <History size={24} strokeWidth={1.5} />
                <p className="text-sm">No recent orders</p>
              </div>
            ) : (
              stats.activity.map((item, i: number) => (
                <motion.div
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  key={item.id}
                  className="flex gap-3 border-b border-stone-100 pb-4 last:border-0 last:pb-0"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
                    <CheckCircle2 size={16} strokeWidth={1.75} className="text-emerald-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-medium text-stone-900">{item.user}</p>
                      <p className="shrink-0 text-sm font-medium tabular-nums text-emerald-600">₱{item.amount.toFixed(2)}</p>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-stone-500">{item.items}</p>
                  </div>
                </motion.div>
              ))
            )}
          </div>
          <div className="border-t border-stone-100 p-4">
            <button
              type="button"
              className="w-full rounded-lg border border-stone-200 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
            >
              View history
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReceiptModal({
  orderId,
  items,
  subtotal,
  discount,
  total,
  cashTender,
  change,
  onClose,
  onSaved,
}: {
  orderId: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  total: number;
  cashTender?: number;
  change?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const handleSaveReceipt = () => {
    const shortId = orderId.slice(-8).toUpperCase();
    const lines: string[] = [
      "Café Tinto",
      "Receipt",
      `Order #${shortId}`,
      `ID: ${orderId}`,
      "",
      "Items:",
      ...items.map(
        (item) => `${item.quantity}× ${item.name} — ₱${(item.price * item.quantity).toFixed(2)}`
      ),
      "",
      `Subtotal: ₱${subtotal.toFixed(2)}`,
      ...(discount > 0 ? [`Discount: −₱${discount.toFixed(2)}`] : []),
      `Total: ₱${total.toFixed(2)}`,
    ];
    if (cashTender != null && cashTender > 0) {
      lines.push(`Cash: ₱${cashTender.toFixed(2)}`);
    }
    if (change != null && cashTender != null && cashTender > 0) {
      lines.push(`Change (sukli): ₱${change.toFixed(2)}`);
    }
    lines.push("", new Date().toLocaleString());
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cafetinto-receipt-${shortId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.98, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 12 }}
        className="relative z-10 flex w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-lg"
      >
        <div className="flex flex-col items-center gap-5 p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white">
            <CheckCircle2 size={28} strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-stone-900">Payment complete</h2>
            <p className="mt-1 font-mono text-xs text-stone-500">#{orderId.slice(-8).toUpperCase()}</p>
          </div>

          <div className="w-full rounded-xl border border-stone-100 bg-stone-50/80 p-4 text-left">
            <div className="flex flex-col gap-2.5">
              {items.map((item, i) => (
                <div key={i} className="flex justify-between gap-3 text-sm">
                  <div className="flex min-w-0 flex-1 gap-2">
                    <span className="shrink-0 text-stone-400">{item.quantity}×</span>
                    <span className="min-w-0 flex-1 break-words leading-snug text-stone-800">{item.name}</span>
                  </div>
                  <span className="shrink-0 font-medium tabular-nums text-stone-900">₱{(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="my-3 h-px bg-stone-200" />
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-stone-500">
                <span>Subtotal</span>
                <span className="tabular-nums">₱{subtotal.toFixed(2)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Discount</span>
                  <span className="tabular-nums">−₱{discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-stone-200 pt-2">
                <span className="font-medium text-stone-900">Total</span>
                <span className="text-lg font-semibold tabular-nums text-stone-900">₱{total.toFixed(2)}</span>
              </div>
              {cashTender != null && cashTender > 0 && (
                <div className="flex justify-between text-stone-600">
                  <span>Cash</span>
                  <span className="tabular-nums">₱{cashTender.toFixed(2)}</span>
                </div>
              )}
              {change != null && cashTender != null && cashTender > 0 && (
                <div className="flex justify-between font-medium text-emerald-700">
                  <span>Change (sukli)</span>
                  <span className="tabular-nums">₱{change.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="grid w-full grid-cols-2 gap-2">
            <button type="button" className="flex items-center justify-center gap-2 rounded-lg border border-stone-200 bg-stone-900 py-3 text-sm font-medium text-white hover:bg-stone-800">
              <Printer size={16} strokeWidth={1.75} />
              Print
            </button>
            <button
              type="button"
              onClick={handleSaveReceipt}
              className="flex items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white py-3 text-sm font-medium text-stone-700 hover:bg-stone-50"
            >
              <Download size={16} strokeWidth={1.75} />
              Save
            </button>
          </div>
          <button type="button" onClick={onClose} className="text-xs font-medium text-stone-400 hover:text-stone-800">
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function ExpensesView() {
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({ description: "", amount: 0, category: "Coffee Beans", date: new Date().toISOString().split('T')[0] });

  const categories = [
    "Coffee Beans", 
    "Milk & Dairy", 
    "Syrups & Ingredients", 
    "Packaging (Cups/Lids)", 
    "Pastry Inventory",
    "Equipment Maintenance", 
    "Utilities (Water/Elec)", 
    "Staff Wages", 
    "Rent & Space", 
    "Marketing",
    "Others"
  ];

  useEffect(() => {
    fetchExpenses();
  }, []);

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/expenses");
      const data: unknown = await res.json();
      setExpenses(Array.isArray(data) ? (data as ExpenseRow[]) : []);
    } catch (err) {
      console.error("Failed to fetch expenses", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          date: new Date(form.date).getTime()
        })
      });
      if (res.ok) {
        setIsModalOpen(false);
        setForm({ description: "", amount: 0, category: "Coffee Beans", date: new Date().toISOString().split('T')[0] });
        fetchExpenses();
      }
    } catch (err) {
      console.error("Failed to add expense", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this expense?")) return;
    try {
      const res = await fetch(`/api/expenses/${id}`, { method: "DELETE" });
      if (res.ok) fetchExpenses();
    } catch (err) {
      console.error("Failed to delete expense", err);
    }
  };

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-stone-900">Expenses</h2>
          <p className="text-sm text-stone-500">Operational costs</p>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
        >
          <Plus size={16} strokeWidth={1.75} />
          Add expense
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="flex flex-col justify-between rounded-xl border border-stone-200 bg-white p-6 md:col-span-1">
          <div>
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-red-600 text-white">
              <TrendingDown size={18} strokeWidth={1.75} />
            </div>
            <p className="text-xs text-stone-500">Total (all time)</p>
            <h3 className="mt-1 text-2xl font-semibold tabular-nums text-stone-900">₱{totalExpenses.toFixed(2)}</h3>
          </div>
          <p className="mt-4 border-t border-stone-100 pt-4 text-xs leading-relaxed text-stone-500">Used with dashboard profit.</p>
        </div>

        <div className="flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white md:col-span-2">
          <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
            <h3 className="text-sm font-medium text-stone-900">Recent</h3>
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">{expenses.length}</span>
          </div>
          <div className="max-h-[400px] flex-1 overflow-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-stone-100 bg-stone-50/80 text-xs font-medium text-stone-500">
                  <th className="px-4 py-3 sm:px-5">Description</th>
                  <th className="px-4 py-3 text-right sm:px-5">Amount</th>
                  <th className="w-12 px-4 py-3 sm:px-5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {loading ? (
                  <tr>
                    <td colSpan={3} className="py-12 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-stone-600" />
                    </td>
                  </tr>
                ) : expenses.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-16 text-center text-sm text-stone-500">
                      No expenses yet.
                    </td>
                  </tr>
                ) : (
                  expenses.map((e) => (
                    <tr key={e.id} className="group transition-colors hover:bg-stone-50/80">
                      <td className="px-4 py-3 sm:px-5">
                        <p className="font-medium text-stone-900">{e.description}</p>
                        <p className="mt-0.5 text-xs text-stone-500">
                          {e.category} · {new Date(e.date).toLocaleDateString()}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-red-600 sm:px-5">−₱{e.amount.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right sm:px-5">
                        <button
                          type="button"
                          onClick={() => handleDelete(e.id)}
                          className="rounded-lg p-2 text-stone-400 hover:bg-red-50 hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100"
                        >
                          <Trash2 size={16} strokeWidth={1.75} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-lg"
            >
              <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 sm:p-8">
                <div className="mb-1 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-stone-900 text-white">
                    <Receipt size={18} strokeWidth={1.75} />
                  </div>
                  <h3 className="text-lg font-semibold text-stone-900">New expense</h3>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-stone-500">Description</label>
                  <input
                    required
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="e.g. Beans, electricity"
                    className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm focus:border-stone-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-900/10"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-stone-500">Amount (₱)</label>
                    <input
                      required
                      type="number"
                      step="0.01"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) })}
                      className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm tabular-nums focus:border-stone-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-900/10"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-stone-500">Date</label>
                    <input
                      required
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })}
                      className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm focus:border-stone-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-900/10"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-stone-500">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm focus:border-stone-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-900/10"
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <button type="submit" className="mt-2 rounded-lg bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-800">
                  Save
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HistoryView({ userId }: { userId: string }) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null);

  useEffect(() => {
    fetchOrders();
  }, [userId]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/history/${userId}`);
      const data: unknown = await res.json();
      setOrders(Array.isArray(data) ? (data as OrderRow[]) : []);
    } catch (err) {
      console.error("Failed to fetch orders", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteOrder = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to void this order?")) return;
    try {
      const res = await fetch(`/api/orders/${id}`, { method: "DELETE" });
      if (res.ok) fetchOrders();
    } catch (err) {
      console.error("Failed to delete order", err);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/orders/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        fetchOrders();
        setSelectedOrder(prev => prev ? { ...prev, status } : null);
      }
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  const friendlyIds = useMemo(() => {
    const sorted = [...orders].sort(
      (a, b) => (a.createdAt || 0) - (b.createdAt || 0)
    );
    const counters: Record<number, number> = {};
    const map: Record<string, string> = {};
    for (const o of sorted) {
      const year = new Date(o.createdAt || Date.now()).getFullYear();
      counters[year] = (counters[year] || 0) + 1;
      const seq = String(counters[year]).padStart(2, "0");
      map[o.id] = `${year}${seq}`;
    }
    return map;
  }, [orders]);

  const filteredOrders = orders.filter((o) => {
    const q = search.toLowerCase();
    return (
      o.id.toLowerCase().includes(q) ||
      (friendlyIds[o.id] || "").toLowerCase().includes(q) ||
      (o.totalAmount != null && o.totalAmount.toString().includes(search))
    );
  });

  const totalSales = filteredOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const orderCount = filteredOrders.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-stone-900">Order history</h2>
          <p className="text-sm text-stone-500">Past transactions</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} strokeWidth={1.75} />
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-stone-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-stone-300 focus:outline-none focus:ring-1 focus:ring-stone-900/10"
            />
          </div>
          <button
            type="button"
            onClick={fetchOrders}
            className="rounded-lg border border-stone-200 bg-white p-2 text-stone-600 hover:bg-stone-50"
            title="Refresh"
          >
            <History size={18} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <p className="text-xs text-stone-500">Sales (filtered)</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-stone-900">₱{totalSales.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <p className="text-xs text-stone-500">Orders</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-stone-900">{orderCount}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50/80 text-xs font-medium text-stone-500">
              <th className="px-4 py-3 sm:px-5">ID</th>
              <th className="px-4 py-3 sm:px-5">When</th>
              <th className="hidden px-4 py-3 sm:table-cell sm:px-5">Items</th>
              <th className="px-4 py-3 sm:px-5">Status</th>
              <th className="px-4 py-3 sm:px-5">Total</th>
              <th className="w-12 px-4 py-3 sm:px-5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="py-16 text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-stone-600" />
                </td>
              </tr>
            ) : filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-16 text-center text-sm text-stone-500">
                  No orders found.
                </td>
              </tr>
            ) : (
              filteredOrders.map((order) => (
                <tr
                  key={order.id}
                  className="group cursor-pointer transition-colors hover:bg-stone-50/80"
                  onClick={() => setSelectedOrder(order)}
                >
                  <td className="px-4 py-3 font-mono text-xs text-stone-500 sm:px-5">#{friendlyIds[order.id] ?? order.id.slice(0, 8)}</td>
                  <td className="px-4 py-3 sm:px-5">
                    <p className="font-medium text-stone-900">{new Date(order.createdAt).toLocaleDateString()}</p>
                    <p className="text-xs text-stone-500">
                      {new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell sm:px-5">
                    <div className="flex -space-x-1.5">
                      {order.items?.slice(0, 3).map((item, i: number) => (
                        <div
                          key={i}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-white bg-stone-100 text-[10px] font-medium text-stone-600"
                        >
                          {item.name[0]}
                        </div>
                      ))}
                      {order.items?.length > 3 && (
                        <div className="flex h-7 w-7 items-center justify-center rounded-md border border-white bg-stone-800 text-[10px] font-medium text-white">
                          +{order.items.length - 3}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 sm:px-5">
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${
                        order.status === "completed"
                          ? "bg-emerald-50 text-emerald-800"
                          : order.status === "cancelled"
                            ? "bg-red-50 text-red-700"
                            : "bg-amber-50 text-amber-800"
                      }`}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium tabular-nums text-stone-900 sm:px-5">₱{order.totalAmount.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right sm:px-5">
                    <button
                      type="button"
                      onClick={(e) => handleDeleteOrder(order.id, e)}
                      className="rounded-lg p-2 text-stone-400 hover:bg-red-50 hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      <Trash2 size={16} strokeWidth={1.75} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {selectedOrder && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedOrder(null)}
              className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-stone-200 bg-white shadow-lg"
            >
              <div className="flex flex-col gap-6 p-6 sm:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-stone-900">
                      Order #{friendlyIds[selectedOrder.id] ?? selectedOrder.id.slice(0, 8)}
                    </h3>
                    <p className="mt-0.5 font-mono text-[11px] text-stone-400">{selectedOrder.id}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedOrder(null)}
                    className="rounded-lg border border-stone-200 p-2 text-stone-500 hover:bg-stone-50 hover:text-stone-900"
                    aria-label="Close"
                  >
                    <Plus size={18} className="rotate-45" strokeWidth={1.75} />
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-100 bg-stone-50 px-4 py-3">
                  <div>
                    <p className="text-xs text-stone-500">Status</p>
                    <span
                      className={`mt-1 inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${
                        selectedOrder.status === "completed"
                          ? "bg-emerald-100 text-emerald-800"
                          : selectedOrder.status === "cancelled"
                            ? "bg-red-100 text-red-800"
                            : "bg-amber-100 text-amber-900"
                      }`}
                    >
                      {selectedOrder.status}
                    </span>
                  </div>
                  {selectedOrder.userId ? (
                    <div className="text-right">
                      <p className="text-xs text-stone-500">Staff</p>
                      <p className="font-mono text-xs text-stone-700">{selectedOrder.userId}</p>
                    </div>
                  ) : (
                    <div className="text-right">
                      <p className="text-xs text-stone-500">Staff</p>
                      <p className="text-xs text-stone-400">—</p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium text-stone-500">Update status</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => updateStatus(selectedOrder.id, "completed")}
                      disabled={selectedOrder.status === "completed"}
                      className="rounded-lg border border-stone-200 py-2 text-xs font-medium text-stone-800 hover:bg-stone-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Complete
                    </button>
                    <button
                      type="button"
                      onClick={() => updateStatus(selectedOrder.id, "cancelled")}
                      disabled={selectedOrder.status === "cancelled"}
                      className="rounded-lg border border-stone-200 py-2 text-xs font-medium text-stone-800 hover:border-red-200 hover:bg-red-50 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Cancel
                    </button>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium text-stone-500">Items</p>
                  <div className="scrollbar-hide max-h-[240px] space-y-2 overflow-y-auto">
                    {selectedOrder.items?.map((item, i: number) => (
                      <div key={i} className="flex items-center justify-between rounded-lg border border-stone-100 px-3 py-2.5 text-sm">
                        <span className="text-stone-600">
                          {item.quantity}× {item.name}
                        </span>
                        <span className="font-medium tabular-nums text-stone-900">₱{(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-3 border-t border-stone-100 pt-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs text-stone-500">Total</p>
                    <p className="text-2xl font-semibold tabular-nums text-stone-900">₱{selectedOrder.totalAmount.toFixed(2)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-800"
                  >
                    <Printer size={16} strokeWidth={1.75} />
                    Print
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
