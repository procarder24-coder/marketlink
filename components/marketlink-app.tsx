"use client";

import Image from "next/image";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  CreditCard,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Heart,
  LayoutDashboard,
  LifeBuoy,
  LogIn,
  MapPin,
  Menu,
  MessageCircle,
  Package,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Store,
  Truck,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { z } from "zod";
import { createGuestAccessToken } from "@/lib/guest-token";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Section = "marketplace" | "orders" | "vendor" | "admin" | "store";
type Modal = "checkout" | "onboarding" | "product" | "auth" | null;
type DemoVendorStatus = "Not started" | "In review" | "Needs additional information" | "Manual review required" | "Approved" | "Rejected";
type Order = {
  id: string;
  date: string;
  items: string;
  total: number;
  status: "Payment pending" | "Paid" | "Payment failed" | "Cancelled" | "Refunded" | "Partially refunded";
  livePayment?: boolean;
  token?: string;
  checkoutId?: string;
  paymentReference?: string;
  paymentIdempotencyKey?: string;
  vendorOrders?: VendorOrder[];
};
type VendorOrder = {
  id: string;
  store: string;
  date: string;
  items: string;
  itemSummary: string[];
  total: number;
  fulfilmentStatus: "Pending" | "Confirmed" | "Preparing" | "In transit" | "Delivered";
  paymentStatus: Order["status"];
  checkoutReference: string;
};

type Product = {
  id: string;
  name: string;
  store: string;
  category: string;
  price: number;
  rating: number;
  image: string;
  badge?: string;
  stock: number;
  sku?: string;
};

const liveProductRowsSchema = z.array(z.object({
  id: z.string().uuid(),
  name: z.string(),
  price_pesewas: z.number().int().positive().safe(),
  stock_quantity: z.number().int().nonnegative(),
  sku: z.string().nullable(),
  categories: z.object({ name: z.string() }).nullable(),
  vendor_stores: z.object({ name: z.string() }).nullable(),
  product_images: z.array(z.object({
    storage_path: z.string(),
    display_order: z.number().int(),
  })).nullable().optional(),
}));

const adminApplicationsSchema = z.array(z.object({
  id: z.string().uuid(),
  business_type: z.enum(["individual", "registered_business"]),
  business_name: z.string(),
  categories: z.object({ name: z.string() }).nullable(),
  region: z.string(),
  location: z.string(),
  business_role: z.string(),
  application_status: z.enum(["draft", "submitted", "under_review", "approved", "rejected", "needs_information"]),
  verification_status: z.enum(["submitted", "awaiting_verification", "processing", "needs_additional_information", "manual_review_required", "approved", "rejected"]),
  action_required_message: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
}));
type AdminApplication = z.infer<typeof adminApplicationsSchema>[number];

const initialProducts: Product[] = [
  { id: "demo-1", name: "Handwoven Kente Tote", store: "Asaase Collective", category: "Fashion", price: 380, rating: 4.9, image: "photo-1590874103328-eac38a683ce7", badge: "Bestseller", stock: 8 },
  { id: "demo-2", name: "Shea & Baobab Body Butter", store: "Naya Botanics", category: "Beauty", price: 145, rating: 4.8, image: "photo-1608248543803-ba4f8c70ae0b", badge: "Small batch", stock: 14 },
  { id: "demo-3", name: "Studio Stoneware Set", store: "Clay House Accra", category: "Home", price: 520, rating: 5.0, image: "photo-1493106641515-6b5631de4bb9", badge: "Made in Ghana", stock: 4 },
  { id: "demo-4", name: "Adinkra Print Shirt", store: "Sunday Studio", category: "Fashion", price: 290, rating: 4.7, image: "photo-1521572163474-6864f9cf17ab", stock: 11 },
  { id: "demo-5", name: "Cocoa & Coffee Gift Box", store: "Naya Botanics", category: "Food & drink", price: 210, rating: 4.9, image: "photo-1542990253-0b8be5b8b5c9", badge: "Gift-ready", stock: 7 },
  { id: "demo-6", name: "Woven Market Basket", store: "Asaase Collective", category: "Home", price: 260, rating: 4.8, image: "photo-1590736969955-71cc94901144", stock: 5 },
  { id: "demo-7", name: "Coastal Linen Set", store: "Sunday Studio", category: "Fashion", price: 450, rating: 4.9, image: "photo-1598033129183-c4f50c736f10", stock: 3 },
  { id: "demo-8", name: "Calm Ritual Oil", store: "Naya Botanics", category: "Beauty", price: 125, rating: 4.8, image: "photo-1608571423902-eed4a5ad8108", stock: 0 },
];
const categories = ["All products", "Fashion", "Beauty", "Home", "Food & drink", "Arts & crafts"];
type AdminAccessState = "checking" | "denied" | "mfa_required" | "authorized" | "unavailable";

async function loadAdminAccess(): Promise<AdminAccessState> {
  try {
    const response = await fetch("/api/admin/session", { cache: "no-store" });
    const result = await response.json() as { authorized?: boolean; code?: string };
    if (response.ok && result.authorized) return "authorized";
    if (result.code === "mfa_required") return "mfa_required";
    if (response.status >= 500) return "unavailable";
    return "denied";
  } catch {
    return "unavailable";
  }
}

const revenue = [
  { day: "Mon", value: 1250 }, { day: "Tue", value: 1980 }, { day: "Wed", value: 1640 },
  { day: "Thu", value: 2520 }, { day: "Fri", value: 2180 }, { day: "Sat", value: 3260 }, { day: "Sun", value: 2910 },
];
const money = (amount: number) => `GH₵ ${amount.toLocaleString("en-GH")}`;
const imageUrl = (id: string) => id.startsWith("https://") ? id : `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=85`;

const onboardingSchema = z.object({
  fullName: z.string().min(3, "Enter your legal name."),
  email: z.string().email("Enter a valid email address."),
  phone: z.string().min(9, "Enter a valid Ghanaian phone number."),
  password: z.string().min(8, "Use at least 8 characters."),
  terms: z.boolean().refine(Boolean, "Accept the terms to continue."),
  businessType: z.enum(["Individual", "Registered business"]),
  businessName: z.string().min(2, "Add a business or trading name."),
  category: z.string().min(1, "Choose a category."),
  region: z.string().min(1, "Choose a region."),
  location: z.string().min(2, "Add your town or area."),
  businessRole: z.string().min(2, "Tell us your role in the business."),
  registrationNumber: z.string().optional(),
});
type OnboardingValues = z.infer<typeof onboardingSchema>;

const navItems: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: "marketplace", label: "Marketplace", icon: ShoppingBag },
  { id: "orders", label: "My orders", icon: Package },
  { id: "vendor", label: "Vendor workspace", icon: Store },
  { id: "admin", label: "Admin console", icon: LayoutDashboard },
];

function IconButton({ icon: Icon, label, onClick, badge }: { icon: LucideIcon; label: string; onClick?: () => void; badge?: string }) {
  return (
    <button className="icon-button" aria-label={label} onClick={onClick}>
      <Icon size={19} strokeWidth={1.8} />
      {badge && <span className="icon-badge">{badge}</span>}
    </button>
  );
}

function StatusPill({ children, tone = "green" }: { children: ReactNode; tone?: "green" | "amber" | "gray" | "red" }) {
  return <span className={`status-pill ${tone}`}><span className="status-dot" />{children}</span>;
}

export function MarketLinkApp() {
  const [section, setSection] = useState<Section>("marketplace");
  const [category, setCategory] = useState("All products");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState(initialProducts);
  const [liveCatalog, setLiveCatalog] = useState(false);
  const [demoLoaded, setDemoLoaded] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [step, setStep] = useState(1);
  const [vendorStatus, setVendorStatus] = useState<DemoVendorStatus>("Not started");
  const [flash, setFlash] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [adminAccess, setAdminAccess] = useState<AdminAccessState>("checking");
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [checkingOrderId, setCheckingOrderId] = useState<string | null>(null);
  const cartCount = Object.values(cart).reduce((sum, qty) => sum + qty, 0);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("marketlink-demo");
      if (saved) {
        const data = JSON.parse(saved) as { cart?: Record<string, number>; orders?: Order[]; products?: Product[]; vendorStatus?: DemoVendorStatus; liveCatalog?: boolean };
        // Browser-only demo persistence must load after hydration to avoid a server/client mismatch.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCart(data.liveCatalog ? {} : data.cart ?? {});
        setOrders(data.orders ?? []);
        setProducts(!data.liveCatalog && Array.isArray(data.products) ? data.products.map((product) => ({ ...product, id: String(product.id), stock: Number.isInteger(product.stock) ? product.stock : 0 })) : initialProducts);
        setVendorStatus(data.vendorStatus ?? "Not started");
      }
    } catch {
      setFlash("Your saved demo data could not be loaded. Starting a fresh sandbox session.");
    } finally {
      setDemoLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!demoLoaded || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;
    let active = true;
    const supabase = createSupabaseBrowserClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? null);
      if (!session) {
        setAdminAccess("denied");
        setSection("marketplace");
        return;
      }
      void loadAdminAccess().then(setAdminAccess);
    });
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setFlash("Your sign-in state could not be verified. Please sign in again.");
        setAdminAccess("denied");
        return;
      }
      setUserEmail(data.user?.email ?? null);
      if (data.user) void loadAdminAccess().then((state) => { if (active) setAdminAccess(state); });
      else setAdminAccess("denied");
    }).catch(() => {
      if (active) {
        setAdminAccess("unavailable");
        setFlash("Your sign-in state could not be verified. Please check your connection.");
      }
    });
    void (async () => {
      try {
        const { data, error } = await supabase.from("products")
          .select("id,name,price_pesewas,stock_quantity,sku,categories(name),vendor_stores(name),product_images(storage_path,display_order)")
          .eq("status", "published")
          .order("created_at", { ascending: false })
          .limit(60);
        if (!active) return;
        if (error) {
          setFlash("The connected catalogue is unavailable. Showing sandbox sample products.");
          return;
        }
        const parsedRows = liveProductRowsSchema.safeParse(data);
        if (!parsedRows.success) {
          setFlash("The connected catalogue returned invalid product data. Showing sandbox sample products.");
          return;
        }
        if (parsedRows.data.length === 0) return;
        const liveProducts = parsedRows.data.map((row) => {
          const image = row.product_images?.sort((left, right) => left.display_order - right.display_order)[0];
          const imageUrl = image
            ? supabase.storage.from("marketplace-public").getPublicUrl(image.storage_path).data.publicUrl
            : "photo-1542838132-92c53300491e";
          const databaseCategory = row.categories?.name ?? "Arts & crafts";
          const categoryName = databaseCategory.toLowerCase().startsWith("fashion") ? "Fashion"
            : databaseCategory.toLowerCase().startsWith("beauty") ? "Beauty"
              : databaseCategory.toLowerCase().startsWith("home") ? "Home"
                : databaseCategory.toLowerCase().startsWith("food") ? "Food & drink"
                  : "Arts & crafts";
          return {
            id: row.id,
            name: row.name,
            store: row.vendor_stores?.name ?? "MarketLink store",
            category: categoryName,
            price: row.price_pesewas / 100,
            rating: 0,
            image: imageUrl,
            stock: row.stock_quantity,
            sku: row.sku ?? undefined,
          };
        });
        setProducts(liveProducts);
        setCart({});
        setLiveCatalog(true);
      } catch {
        if (active) setFlash("The connected catalogue could not be loaded. Showing sandbox sample products.");
      }
    })();
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [demoLoaded]);

  useEffect(() => {
    localStorage.setItem("marketlink-demo", JSON.stringify({
      cart: liveCatalog ? {} : cart,
      orders,
      products: liveCatalog ? initialProducts : products,
      vendorStatus,
      liveCatalog,
    }));
  }, [cart, liveCatalog, orders, products, vendorStatus]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(""), 3600);
    return () => window.clearTimeout(timer);
  }, [flash]);

  useEffect(() => {
    const openOnboarding = () => { setStep(1); setModal("onboarding"); };
    const openProductForm = () => setModal("product");
    window.addEventListener("open-vendor-onboarding", openOnboarding);
    window.addEventListener("open-product-form", openProductForm);
    return () => {
      window.removeEventListener("open-vendor-onboarding", openOnboarding);
      window.removeEventListener("open-product-form", openProductForm);
    };
  }, []);

  const filteredProducts = useMemo(() => products.filter((product) => {
    const matchesCategory = category === "All products" || product.category === category;
    const matchesQuery = `${product.name} ${product.store} ${product.category}`.toLowerCase().includes(query.toLowerCase());
    return matchesCategory && matchesQuery;
  }), [category, products, query]);

  const cartItems = Object.entries(cart).flatMap(([id, qty]) => {
    const product = products.find((item) => item.id === id);
    return product && qty > 0 ? [{ ...product, qty }] : [];
  });
  const subtotal = cartItems.reduce((total, item) => total + item.price * item.qty, 0);

  const addToCart = (productId: string) => {
    const product = products.find((item) => item.id === productId);
    if (!product || product.stock <= (cart[productId] ?? 0)) {
      setFlash(product?.stock ? "You’ve reached the available stock for this item." : "This item is currently out of stock.");
      return;
    }
    setCart((current) => ({ ...current, [productId]: (current[productId] ?? 0) + 1 }));
    setFlash("Added to your bag");
  };
  const updateQuantity = (productId: string, amount: number) => {
    const product = products.find((item) => item.id === productId);
    if (amount > 0 && (!product || (cart[productId] ?? 0) >= product.stock)) {
      setFlash("You’ve reached the available stock for this item.");
      return;
    }
    setCart((current) => {
      const next = { ...current, [productId]: (current[productId] ?? 0) + amount };
      if (next[productId] <= 0) delete next[productId];
      return next;
    });
  };
  const navigate = (next: Section) => {
    if (next === "admin") {
      void loadAdminAccess().then((access) => {
        setAdminAccess(access);
        if (access === "authorized" || access === "mfa_required") {
          setSection("admin");
          setMobileNav(false);
        } else {
          setFlash(access === "unavailable"
            ? "Administrator access could not be verified. Please try again."
            : "Administrator access is not assigned to this account.");
        }
      });
      return;
    }
    setSection(next);
    setMobileNav(false);
  };
  const submitVendor = () => {
    setVendorStatus("In review");
    setStep(1);
    setModal(null);
    setFlash("Sandbox application submitted. No identity documents or biometrics were collected.");
  };
  const handleAccountClick = async () => {
    if (!userEmail) {
      setModal("auth");
      return;
    }
    try {
      const { error } = await createSupabaseBrowserClient().auth.signOut();
      if (error) throw error;
      setFlash("You have signed out.");
    } catch {
      setFlash("We could not sign you out. Please try again.");
    }
  };
  const startMomoPayment = async (order: Order) => {
    if (!order.checkoutId || !order.paymentIdempotencyKey) {
      setFlash("This order cannot be resumed as a server payment.");
      return;
    }
    setCheckingOrderId(order.id);
    try {
      const response = await fetch("/api/payments/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkoutId: order.checkoutId,
          idempotencyKey: order.paymentIdempotencyKey,
          ...(order.token ? { guestAccessToken: order.token } : {}),
        }),
      });
      const result = await response.json() as { reference?: string; message?: string; error?: string };
      if (!response.ok || !result.reference) {
        setFlash(result.error ?? "The MoMo payment request could not be started.");
        return;
      }
      setOrders((current) => current.map((item) => item.id === order.id
        ? { ...item, paymentReference: result.reference }
        : item));
      setFlash(result.message ?? "Approve the payment prompt on your MTN MoMo phone.");
    } catch {
      setFlash("The MoMo service could not be reached. Check your order before trying again.");
    } finally {
      setCheckingOrderId(null);
    }
  };
  const checkPaymentStatus = async (order: Order) => {
    if (!order.checkoutId || !order.paymentReference) {
      setFlash("This order does not have a MoMo payment reference to check.");
      return;
    }
    setCheckingOrderId(order.id);
    try {
      const response = await fetch("/api/payments/momo/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkoutId: order.checkoutId,
          reference: order.paymentReference,
          ...(order.token ? { guestAccessToken: order.token } : {}),
        }),
      });
      const result = await response.json() as { status?: string; error?: string };
      if (!response.ok || !result.status) {
        setFlash(result.error ?? "Payment status could not be checked.");
        return;
      }
      const nextStatus: Order["status"] = result.status === "paid" ? "Paid"
        : result.status === "failed" ? "Payment failed"
          : result.status === "cancelled" ? "Cancelled"
            : result.status === "refunded" ? "Refunded"
              : result.status === "partially_refunded" ? "Partially refunded"
                : "Payment pending";
      setOrders((current) => current.map((item) => item.id === order.id
        ? { ...item, status: nextStatus }
        : item));
      setFlash(nextStatus === "Paid" ? "MTN MoMo confirmed your payment."
        : nextStatus === "Payment failed" ? "MTN MoMo reports that this payment failed."
          : "Payment is still pending. Approve the prompt on your phone and check again.");
    } catch {
      setFlash("The payment status service could not be reached. Try again shortly.");
    } finally {
      setCheckingOrderId(null);
    }
  };
  const createOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (checkoutSubmitting) return;
    const form = new FormData(event.currentTarget);
    if (!form.get("buyerName") || !form.get("email") || !form.get("phone") || !form.get("address")) {
      setFlash("Complete each required delivery detail.");
      return;
    }
    if (liveCatalog) {
      setCheckoutSubmitting(true);
      const token = userEmail ? undefined : createGuestAccessToken();
      const createIdempotencyKey = crypto.randomUUID();
      let createdOrder: { checkoutId: string; reference: string };
      try {
        const response = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotencyKey: createIdempotencyKey,
            buyerName: String(form.get("buyerName")),
            email: String(form.get("email")),
            phone: String(form.get("phone")),
            deliveryAddress: String(form.get("address")),
            region: String(form.get("region")),
            ...(token ? { guestAccessToken: token } : {}),
            items: cartItems.map(({ id, qty }) => ({ productId: id, quantity: qty })),
          }),
        });
        const result = await response.json() as {
          checkoutId?: string;
          reference?: string;
          error?: string;
        };
        if (!response.ok || !result.checkoutId || !result.reference) {
          setFlash(result.error ?? "The order could not be created. Please try again.");
          setCheckoutSubmitting(false);
          return;
        }
        createdOrder = { checkoutId: result.checkoutId, reference: result.reference };
      } catch {
        setFlash("The order service could not be reached. Your cart is unchanged.");
        setCheckoutSubmitting(false);
        return;
      }

      const paymentIdempotencyKey = crypto.randomUUID();
      const order: Order = {
        id: createdOrder.reference,
        date: new Date().toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" }),
        items: `${cartCount} ${cartCount === 1 ? "item" : "items"}`,
        total: subtotal,
        status: "Payment pending",
        livePayment: true,
        token,
        checkoutId: createdOrder.checkoutId,
        paymentIdempotencyKey,
        vendorOrders: [],
      };
      setOrders((current) => [order, ...current]);
      setCart({});
      setModal(null);
      setSection("orders");
      try {
        const response = await fetch("/api/payments/initialize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            checkoutId: createdOrder.checkoutId,
            idempotencyKey: paymentIdempotencyKey,
            ...(token ? { guestAccessToken: token } : {}),
          }),
        });
        const result = await response.json() as { reference?: string; message?: string; error?: string };
        if (!response.ok || !result.reference) {
          setFlash(result.error ?? `Order ${order.id} was created, but the MoMo request could not be started.`);
          setCheckoutSubmitting(false);
          return;
        }
        setOrders((current) => current.map((item) => item.id === order.id
          ? { ...item, paymentReference: result.reference }
          : item));
        setFlash(result.message ?? "Approve the payment prompt on your MTN MoMo phone.");
      } catch {
        setFlash(`Order ${order.id} was created, but the MoMo service could not be reached. Check the order status before retrying.`);
      }
      setCheckoutSubmitting(false);
      return;
    }
    const token = createGuestAccessToken();
    const id = `ML-${Math.floor(100000 + Math.random() * 900000)}`;
    const byStore = new Map<string, typeof cartItems>();
    for (const item of cartItems) byStore.set(item.store, [...(byStore.get(item.store) ?? []), item]);
    const vendorOrders = [...byStore.entries()].map(([store, items]) => ({
      id: `VO-${Math.floor(100000 + Math.random() * 900000)}`,
      store,
      date: new Date().toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" }),
      items: `${items.reduce((count, item) => count + item.qty, 0)} ${items.reduce((count, item) => count + item.qty, 0) === 1 ? "item" : "items"}`,
      itemSummary: items.map((item) => `${item.name} × ${item.qty}`),
      total: items.reduce((sum, item) => sum + item.price * item.qty, 0),
      fulfilmentStatus: "Pending" as const,
      paymentStatus: "Payment pending" as const,
      checkoutReference: id,
    }));
    const order: Order = {
      id,
      date: new Date().toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" }),
      items: `${cartCount} ${cartCount === 1 ? "item" : "items"}`,
      total: subtotal,
      status: "Payment pending",
      token,
      vendorOrders,
    };
    setOrders((current) => [order, ...current]);
    setCart({});
    setModal(null);
    setSection("orders");
    setFlash(`Order ${order.id} created in sandbox. Payment is not processed.`);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand-lockup" onClick={() => navigate("marketplace")} aria-label="MarketLink home">
          <span className="brand-mark"><span /></span>
          <span>market<span>link</span></span>
        </button>
        <div className="top-search">
          <Search size={17} />
          <input value={query} onChange={(event) => { setQuery(event.target.value); setSection("marketplace"); }} placeholder="Search products, stores and more" aria-label="Search marketplace" />
          <kbd>⌘ K</kbd>
        </div>
        <div className="top-actions">
          <button className="location-button"><MapPin size={16} /><span>Accra, Ghana</span><ChevronDown size={14} /></button>
          <IconButton icon={Bell} label="Notifications" />
          <button className="account-button" onClick={handleAccountClick} aria-label={userEmail ? `Sign out ${userEmail}` : "Sign in or create an account"}><span className="avatar">{userEmail?.[0]?.toUpperCase() ?? "A"}</span><span className="account-name">{userEmail ?? "Account"}</span><ChevronDown size={14} /></button>
          <button className="mobile-menu-button" aria-label="Open menu" onClick={() => setMobileNav(!mobileNav)}><Menu size={21} /></button>
        </div>
      </header>

      <div className="sandbox-banner"><Sparkles size={14} /><span><strong>Sandbox preview</strong> · MTN MoMo sandbox only; no real payments. KYC and messaging providers are not connected, and sample workspace data is illustrative.</span><button onClick={() => setFlash("Sandbox data stays in this browser only.")}>What’s this?</button></div>

      <div className="workspace">
        <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
          <div className="side-section-label">WORKSPACE</div>
          <nav aria-label="Main navigation">
            {navItems.filter(({ id }) => id !== "admin" || adminAccess === "authorized" || adminAccess === "mfa_required").map(({ id, label, icon: Icon }) => (
              <button key={id} className={`nav-item ${section === id ? "active" : ""}`} onClick={() => navigate(id)}>
                <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
                {id === "orders" && orders.length > 0 && <span className="nav-count">{orders.length}</span>}
                {id === "vendor" && ["In review", "Needs additional information", "Manual review required"].includes(vendorStatus) && <span className="nav-ping" />}
              </button>
            ))}
          </nav>
          <div className="side-divider" />
          <div className="side-section-label">YOUR STORES</div>
          <button className="store-shortcut" onClick={() => navigate("store")}><span className="store-avatar">A</span><span><strong>Asaase Collective</strong><small>Verified store</small></span><ChevronRight size={15} /></button>
          <button className="store-shortcut" onClick={() => navigate("store")}><span className="store-avatar clay">C</span><span><strong>Clay House Accra</strong><small>Verified store</small></span><ChevronRight size={15} /></button>
          <button className="add-store" onClick={() => { setStep(1); setModal("onboarding"); }}><Plus size={16} /> Open a store</button>
          <div className="sidebar-bottom">
            <div className="help-card"><span className="help-icon"><LifeBuoy size={17} /></span><div><strong>Need a hand?</strong><p>Our team is here for you.</p><button onClick={() => setFlash("Support requests will be available when support is configured.")}>Visit help centre <ArrowRight size={13} /></button></div></div>
            <div className="profile-row"><span className="avatar profile-avatar">A</span><span><strong>Akosua Mensah</strong><small>Buyer account</small></span><ChevronDown size={15} /></div>
          </div>
        </aside>

        <main className="main-content">
          {section === "marketplace" && <Marketplace products={filteredProducts} category={category} setCategory={setCategory} addToCart={addToCart} onStore={() => navigate("store")} />}
          {section === "orders" && <Orders orders={orders} onStartPayment={startMomoPayment} onCheckPayment={checkPaymentStatus} checkingOrderId={checkingOrderId} />}
          {section === "vendor" && <VendorWorkspace status={vendorStatus} orders={orders.flatMap((order) => (order.vendorOrders ?? []).filter((vendorOrder) => vendorOrder.store === "Asaase Collective").map((vendorOrder) => ({ ...vendorOrder, date: order.date, paymentStatus: order.status, checkoutReference: order.id })))} products={products} openApplication={() => { setStep(1); setModal("onboarding"); }} updateOrder={(checkoutReference, vendorOrderId, status) => setOrders((items) => items.map((order) => order.id !== checkoutReference ? order : ({ ...order, vendorOrders: (order.vendorOrders ?? []).map((vendorOrder) => vendorOrder.id === vendorOrderId ? { ...vendorOrder, fulfilmentStatus: status } : vendorOrder) })))} />}
          {section === "admin" && (adminAccess === "authorized"
            ? <AdminConsole />
            : adminAccess === "mfa_required"
              ? <AdminMfaGate onVerified={async () => {
                const access = await loadAdminAccess();
                setAdminAccess(access);
                setFlash(access === "authorized"
                  ? "Administrator access verified."
                  : "MFA was verified, but administrator access could not be confirmed.");
              }} />
              : <div className="page-content inner-page"><div className="integration-card"><ShieldCheck size={24} /><h3>Administrator access unavailable</h3><p>Access requires a server-assigned administrator role and a verified MFA session.</p></div></div>)}
          {section === "store" && <Storefront addToCart={addToCart} openChat={() => setFlash("WhatsApp click-to-chat is a planned integration; no message was sent.")} />}
        </main>
      </div>

      <button className="floating-cart" onClick={() => setModal("checkout")} aria-label={`Open bag with ${cartCount} items`}>
        <ShoppingBag size={19} /><span>Your bag</span><span className="floating-count">{cartCount}</span>
      </button>

      {flash && <div className="toast" role="status"><CheckCircle2 size={18} />{flash}<button onClick={() => setFlash("")} aria-label="Dismiss"><X size={15} /></button></div>}
      {modal && <div className="modal-backdrop" onMouseDown={(event) => { if (!checkoutSubmitting && event.target === event.currentTarget) setModal(null); }}>
        {modal === "checkout" && <CheckoutModal items={cartItems} subtotal={subtotal} updateQuantity={updateQuantity} close={() => { if (!checkoutSubmitting) setModal(null); }} submit={createOrder} liveCatalog={liveCatalog} submitting={checkoutSubmitting} />}
        {modal === "onboarding" && <OnboardingModal step={step} setStep={setStep} close={() => setModal(null)} submit={submitVendor} />}
        {modal === "product" && <div className="dialog"><div className="dialog-top"><h2>Add a product</h2><button className="icon-button" onClick={() => setModal(null)} aria-label="Close"><X size={19} /></button></div><ProductForm close={() => setModal(null)} save={(product) => { setProducts((all) => [{ ...product, id: `demo-${crypto.randomUUID()}`, store: "Your new store", rating: 0 }, ...all]); setModal(null); setFlash("Product saved to the demo catalogue."); }} /></div>}
        {modal === "auth" && <AuthModal close={() => setModal(null)} />}
      </div>}
    </div>
  );
}

function Marketplace({ products, category, setCategory, addToCart, onStore }: { products: Product[]; category: string; setCategory: (value: string) => void; addToCart: (id: string) => void; onStore: () => void }) {
  const [saved, setSaved] = useState<string[]>([]);
  return <div className="page-content marketplace-page">
    <div className="hero-banner">
      <div className="hero-copy"><span className="hero-kicker"><span /> MADE HERE. FOUND HERE.</span><h1>Good finds.<br /><em>Good people.</em></h1><p>Discover the best of Ghana, all in one place. Shop thoughtfully, support local.</p><button className="hero-button" onClick={() => document.getElementById("discover")?.scrollIntoView({ behavior: "smooth" })}>Explore the marketplace <ArrowRight size={16} /></button><div className="hero-proof"><span><ShieldCheck size={15} /> Verified Ghanaian vendors</span><span><Truck size={15} /> Delivery across Ghana</span></div></div>
      <div className="hero-art" aria-label="Handcrafted Ghanaian goods"><div className="hero-image main-image" /><div className="hero-image detail-image" /><div className="hero-note"><span className="note-star">✳</span><span>Locally made,<br /><strong>lovingly found.</strong></span></div><div className="hero-art-label">A little more local.</div></div>
    </div>
    <div className="trust-strip"><span className="trust-item"><span className="trust-icon"><BadgeCheck size={19} /></span><span><strong>Verified sample sellers</strong><small>Demo catalogue only</small></span></span><span className="trust-item"><span className="trust-icon"><Wallet size={19} /></span><span><strong>Ghana payment methods</strong><small>Provider integration required</small></span></span><span className="trust-item"><span className="trust-icon"><MessageCircle size={19} /></span><span><strong>Talk to the maker</strong><small>Click-to-chat setup required</small></span></span><span className="trust-note">Proudly connecting Ghana, one great find at a time.</span></div>
    <section className="catalog-section" id="discover">
      <div className="section-heading"><div><span className="eyebrow">THE MARKETPLACE</span><h2>Find your next favourite</h2><p>Thoughtful goods from the people who make them.</p></div><button className="text-link" onClick={() => setCategory("All products")}>View all products <ArrowRight size={15} /></button></div>
      <div className="catalog-tools"><div className="category-tabs">{categories.map((item) => <button key={item} className={category === item ? "selected" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div><button className="filter-button"><SlidersHorizontal size={15} /> Filters</button></div>
      {products.length === 0 ? <div className="empty-state"><Search size={24} /><h3>No finds just yet</h3><p>Try another search or category.</p></div> : <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product} addToCart={addToCart} saved={saved.includes(product.id)} toggleSaved={() => setSaved((current) => current.includes(product.id) ? current.filter((id) => id !== product.id) : [...current, product.id])} onStore={onStore} />)}</div>}
      <div className="featured-makers"><div className="featured-heading"><div><span className="eyebrow">GOOD PEOPLE, GOOD WORK</span><h2>Meet the makers</h2></div><button className="text-link" onClick={onStore}>Explore verified sample stores <ArrowRight size={14} /></button></div><div className="maker-grid"><button className="maker-card" onClick={onStore}><span className="maker-portrait asaase">A</span><span><strong>Asaase Collective</strong><small>Textiles & woven pieces · Accra</small><em>Verified sample store <BadgeCheck size={12} /></em></span><ChevronRight size={15} /></button><button className="maker-card" onClick={onStore}><span className="maker-portrait naya">N</span><span><strong>Naya Botanics</strong><small>Thoughtful body care · Kumasi</small><em>Verified sample store <BadgeCheck size={12} /></em></span><ChevronRight size={15} /></button><button className="maker-card" onClick={onStore}><span className="maker-portrait clay">C</span><span><strong>Clay House Accra</strong><small>Everyday ceramics · Accra</small><em>Verified sample store <BadgeCheck size={12} /></em></span><ChevronRight size={15} /></button></div></div>
      <div className="maker-banner"><div className="maker-avatars"><span>A</span><span>N</span><span>C</span><span>+</span></div><p><strong>Made by Ghanaian makers.</strong> Every purchase puts local creativity first.</p><button onClick={onStore}>Meet the makers <ArrowRight size={15} /></button></div>
    </section>
    <section className="join-banner"><div><span className="eyebrow">YOUR CRAFT DESERVES A BIGGER STAGE</span><h2>Are you a Ghanaian maker?</h2><p>Bring your business to MarketLink. Apply to join a growing community of local sellers.</p></div><button onClick={() => window.dispatchEvent(new CustomEvent("open-vendor-onboarding"))}>Become a vendor <ArrowRight size={16} /></button></section>
    <footer className="market-footer"><button className="brand-lockup footer-brand"><span className="brand-mark"><span /></span><span>market<span>link</span></span></button><span>Good finds. Good people. Proudly Ghanaian.</span><nav aria-label="Legal and support"><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="mailto:support@marketlink.gh">Support</a></nav><small>Sample catalogue · Sandbox demonstration</small></footer>
  </div>;
}

function ProductCard({ product, addToCart, saved, toggleSaved, onStore }: { product: Product; addToCart: (id: string) => void; saved: boolean; toggleSaved: () => void; onStore: () => void }) {
  return <article className="product-card">
    <div className="product-image" style={{ backgroundImage: `url("${imageUrl(product.image)}")` }}>
      {product.badge && <span className="product-badge">{product.badge}</span>}
      <button className={`save-button ${saved ? "saved" : ""}`} onClick={toggleSaved} aria-label={saved ? "Remove from saved" : "Save product"}><Heart size={16} fill={saved ? "currentColor" : "none"} /></button>
      <button className="quick-add" disabled={product.stock === 0} onClick={() => addToCart(product.id)}><Plus size={15} /> {product.stock === 0 ? "Out of stock" : "Quick add"}</button>
    </div>
    <div className="product-detail"><button className="product-store" onClick={onStore}>{product.store}<BadgeCheck size={13} fill="#13844c" color="#13844c" /></button><h3>{product.name}</h3><div className="product-meta"><span>{product.category} · {product.stock ? `${product.stock} in stock` : "Out of stock"}</span>{product.rating > 0 && <span className="rating">★ {product.rating.toFixed(1)}</span>}</div><div className="product-bottom"><strong>{money(product.price)}</strong><button disabled={product.stock === 0} onClick={() => addToCart(product.id)} aria-label={`Add ${product.name} to bag`}><Plus size={17} /></button></div></div>
  </article>;
}

function Orders({ orders, onStartPayment, onCheckPayment, checkingOrderId }: { orders: Order[]; onStartPayment: (order: Order) => void; onCheckPayment: (order: Order) => void; checkingOrderId: string | null }) {
  return <div className="page-content inner-page"><PageTitle eyebrow="BUYER ACCOUNT" title="Your orders" subtitle="Follow every find from checkout to your doorstep." />
    {orders.length === 0 ? <div className="empty-card"><div className="empty-illustration"><ShoppingBag size={25} /></div><h3>Your next great find is out there</h3><p>When you place an order, its status and details will show up here.</p><button className="primary-button" onClick={() => document.querySelector<HTMLButtonElement>(".nav-item")?.click()}>Explore the marketplace <ArrowRight size={15} /></button></div> :
      <div className="table-card"><div className="table-header"><div><h3>Order history</h3><p>{orders.length} {orders.length === 1 ? "checkout" : "checkouts"}</p></div><button className="outline-button"><Download size={15} /> Download</button></div><div className="table-scroll"><table><thead><tr><th>ORDER GROUP</th><th>DATE</th><th>ITEMS</th><th>TOTAL</th><th>PAYMENT</th><th>ACTIONS</th></tr></thead><tbody>{orders.map((order) => {
        const isChecking = checkingOrderId === order.id;
        const statusTone = order.status === "Paid" ? "green" : order.status === "Payment pending" ? "amber" : order.status === "Payment failed" || order.status === "Cancelled" ? "red" : "gray";
        return <Fragment key={order.id}><tr><td><strong>{order.id}</strong><small>{order.livePayment ? "Server order" : "Demo checkout"}</small></td><td>{order.date}</td><td>{order.items}</td><td>{money(order.total)}</td><td><StatusPill tone={statusTone}>{order.status === "Payment pending" && !order.livePayment ? "Demo · not paid" : order.status}</StatusPill></td><td>{order.livePayment && order.status === "Payment pending" ? <div className="order-payment-actions">{order.paymentReference ? <button className="text-link" disabled={isChecking} onClick={() => onCheckPayment(order)}>{isChecking ? "Checking…" : "Check payment"}</button> : <button className="text-link" disabled={isChecking} onClick={() => onStartPayment(order)}>{isChecking ? "Starting…" : "Start MoMo"}</button>}</div> : <button className="icon-button compact" aria-label="View order"><ChevronRight size={17} /></button>}</td></tr>{(order.vendorOrders ?? []).map((vendorOrder) => <tr className="vendor-order-row" key={vendorOrder.id}><td><strong>{vendorOrder.id}</strong><small>{vendorOrder.store}</small></td><td>{vendorOrder.date}</td><td>{vendorOrder.items}</td><td>{money(vendorOrder.total)}</td><td><span className="fulfilment-label">Fulfilment: {vendorOrder.fulfilmentStatus}</span></td><td /></tr>)}</Fragment>;
      })}</tbody></table></div><div className="guest-note"><ShieldCheck size={15} /><span>Payment is shown as paid only after server-side MTN confirmation. Demo orders are browser-local and were not paid.</span></div></div>}
    <div className="external-notice"><CircleHelp size={17} /><span><strong>Looking for an older order?</strong> Sign in with the email you used at checkout or contact our support team.</span><button>Get help <ArrowRight size={14} /></button></div>
  </div>;
}

function VendorWorkspace({ status, orders, products, openApplication, updateOrder }: { status: DemoVendorStatus; orders: VendorOrder[]; products: Product[]; openApplication: () => void; updateOrder: (checkoutReference: string, vendorOrderId: string, status: VendorOrder["fulfilmentStatus"]) => void }) {
  const [tab, setTab] = useState("Overview");
  return <div className="page-content inner-page vendor-page">
    <div className="vendor-welcome"><div><span className="eyebrow">VENDOR WORKSPACE</span><h1>Good morning, Akosua <span>✳</span></h1><p>Here’s what’s happening with your business today.</p></div><button className="outline-button" onClick={() => setTab("Settings")}><SlidersHorizontal size={15} /> Store settings</button></div>
    {status !== "Approved" ? <div className={`verification-banner ${status === "In review" || status === "Manual review required" ? "review" : ""}`}><div className="verification-icon">{status === "In review" || status === "Manual review required" ? <Clock3 size={20} /> : <ShieldCheck size={20} />}</div><div><strong>{status === "In review" ? "Your application is being reviewed" : status === "Needs additional information" ? "A little more information is needed" : status === "Manual review required" ? "Your application needs a manual review" : status === "Rejected" ? "Your application was not approved" : "Let’s get your store ready"}</strong><p>{status === "In review" || status === "Manual review required" ? "The sandbox status is illustrative and does not represent a real KYC check." : status === "Needs additional information" ? "Please review the vendor-facing next steps shared with your application. Sensitive internal review signals are not displayed." : status === "Rejected" ? "This sandbox rejection is not a real identity decision. You can resubmit after addressing the stated requirements." : "Complete vendor verification to unlock store publication review and live orders."}</p></div><button className="outline-button" onClick={openApplication}>{status === "In review" || status === "Manual review required" ? "View application" : status === "Rejected" ? "Resubmit demo" : status === "Needs additional information" ? "Continue application" : "Start verification"} <ArrowRight size={15} /></button></div> : <div className="verification-banner"><div className="verification-icon"><CheckCircle2 size={20} /></div><div><strong>Vendor verification approved in this sandbox</strong><p>Identity verification and public store publication are separate decisions. This does not represent a real KYC result.</p></div><StatusPill>Store approval still required</StatusPill></div>}
    <div className="vendor-tabs">{["Overview", "Orders", "Products", "Payouts", "Analytics", "Settings"].map((item) => <button key={item} className={tab === item ? "current" : ""} onClick={() => setTab(item)}>{item}{item === "Orders" && <span className="tab-count">{orders.length}</span>}</button>)}</div>
    {tab === "Overview" && <>
      <div className="metric-grid"><Metric label="Total sales" value={money(12480)} change="+12.8%" icon={Wallet} /><Metric label="Orders" value="38" change="+8.2%" icon={Package} /><Metric label="Store visits" value="1,204" change="+16.4%" icon={Eye} /><Metric label="Conversion rate" value="3.2%" change="+0.6%" icon={ArrowUpRight} /></div>
      <div className="chart-card"><div className="chart-title"><div><h3>Sales overview</h3><p>Your store performance this week</p></div><select aria-label="Analytics period"><option>This week</option><option>This month</option></select></div><div className="chart-legend"><span><i /> Revenue <strong>GH₵ 15,740</strong></span><span className="chart-period">Last 7 days <ArrowUpRight size={14} /></span></div><div className="chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={revenue} margin={{ top: 12, right: 4, left: -18, bottom: 0 }}><defs><linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#13844c" stopOpacity={0.16} /><stop offset="90%" stopColor="#13844c" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#edf0ed" strokeDasharray="3 5" /><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#859087", fontSize: 12 }} dy={9} /><YAxis axisLine={false} tickLine={false} tick={{ fill: "#859087", fontSize: 11 }} tickFormatter={(value: number) => `${value / 1000}k`} /><Tooltip formatter={(value) => [money(Number(value)), "Revenue"]} contentStyle={{ border: "1px solid #e7ebe7", borderRadius: 10, fontSize: 12 }} /><Area type="monotone" dataKey="value" stroke="#13844c" strokeWidth={2.5} fill="url(#revenueFill)" /></AreaChart></ResponsiveContainer></div></div>
      <RecentOrders orders={orders} updateOrder={updateOrder} />
    </>}
    {tab === "Orders" && <RecentOrders orders={orders} updateOrder={updateOrder} />}
    {tab === "Products" && <div className="table-card"><div className="table-header"><div><h3>Your products</h3><p>{products.length} products in your catalogue</p></div><button className="primary-button" disabled={status !== "Approved"} onClick={() => window.dispatchEvent(new CustomEvent("open-product-form"))}><Plus size={15} /> Add product</button></div><div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>PRICE</th><th>CATEGORY</th><th>STATUS</th><th /></tr></thead><tbody>{products.slice(0, 6).map((item) => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.store}</small></td><td>{money(item.price)}</td><td>{item.category}</td><td><StatusPill>{status === "Approved" ? "Active" : "Draft"}</StatusPill></td><td><button className="text-link">Edit</button></td></tr>)}</tbody></table></div>{status !== "Approved" && <div className="guest-note"><ShieldCheck size={15} />Store products cannot be published until vendor verification is approved.</div>}</div>}
    {["Payouts", "Analytics", "Settings"].includes(tab) && <div className="integration-card"><div className="integration-icon"><CreditCard size={22} /></div><span className="eyebrow">COMING WITH YOUR INTEGRATION</span><h3>{tab === "Payouts" ? "Payments & settlements" : tab === "Analytics" ? "Store analytics" : "Store details & policies"}</h3><p>{tab === "Payouts" ? "Connect a supported Ghana payment provider to reconcile transactions, fees and settlements." : tab === "Analytics" ? "Connect your production store data to see accurate sales, traffic and conversion reports." : "Store branding, delivery options, policies and authorized account details will be available after setup."}</p><StatusPill tone="gray">Provider not connected</StatusPill></div>}
  </div>;
}

function RecentOrders({ orders, updateOrder }: { orders: VendorOrder[]; updateOrder: (checkoutReference: string, vendorOrderId: string, status: VendorOrder["fulfilmentStatus"]) => void }) {
  return <div className="table-card recent-orders"><div className="table-header"><div><h3>Recent orders</h3><p>Payment and fulfilment are tracked independently.</p></div><button className="text-link">View all <ArrowRight size={14} /></button></div>{orders.length === 0 ? <div className="small-empty"><Package size={21} /><span>New orders for Asaase Collective will appear here once your store is live.</span></div> : <div className="table-scroll"><table><thead><tr><th>VENDOR ORDER</th><th>ITEMS</th><th>TOTAL</th><th>PAYMENT</th><th>FULFILMENT</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong>{order.id}</strong><small>{order.date}</small></td><td>{order.items}</td><td>{money(order.total)}</td><td><StatusPill tone={order.paymentStatus === "Payment pending" ? "amber" : "green"}>{order.paymentStatus === "Payment pending" ? "Not processed · demo" : order.paymentStatus}</StatusPill></td><td><select value={order.fulfilmentStatus} onChange={(event) => updateOrder(order.checkoutReference, order.id, event.target.value as VendorOrder["fulfilmentStatus"])} aria-label={`Update fulfilment for ${order.id}`}><option>Pending</option><option>Confirmed</option><option>Preparing</option><option>In transit</option><option>Delivered</option></select></td></tr>)}</tbody></table></div>}</div>;
}

function AdminMfaGate({ onVerified }: { onVerified: () => Promise<void> }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [factorLoading, setFactorLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void createSupabaseBrowserClient().auth.mfa.listFactors().then(({ data, error: factorError }) => {
      if (!active) return;
      if (factorError) {
        setError("Authenticator status could not be loaded. Try again or contact your administrator.");
      } else {
        const verifiedFactor = data.totp.find((factor) => factor.status === "verified");
        if (verifiedFactor) setFactorId(verifiedFactor.id);
        else {
          const pendingFactor = data.all.find((factor) => factor.factor_type === "totp" && factor.status === "unverified");
          if (pendingFactor) setFactorId(pendingFactor.id);
        }
      }
      setFactorLoading(false);
    }).catch(() => {
      if (active) {
        setError("Authenticator status could not be loaded. Check your connection and try again.");
        setFactorLoading(false);
      }
    });
    return () => { active = false; };
  }, []);

  const enrollAuthenticator = async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: enrollError } = await createSupabaseBrowserClient().auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "MarketLink administrator",
      });
      if (enrollError) throw enrollError;
      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
    } catch {
      setError("Authenticator enrollment failed. Check Supabase MFA settings and try again.");
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!factorId) return;
    setLoading(true);
    setError("");
    try {
      const auth = createSupabaseBrowserClient().auth;
      if (qrCode) {
        const { data: challenge, error: challengeError } = await auth.mfa.challenge({ factorId });
        if (challengeError) throw challengeError;
        const { error: verifyError } = await auth.mfa.verify({
          factorId,
          challengeId: challenge.id,
          code: code.trim(),
        });
        if (verifyError) throw verifyError;
      } else {
        const { error: verifyError } = await auth.mfa.challengeAndVerify({
          factorId,
          code: code.trim(),
        });
        if (verifyError) throw verifyError;
      }
      setCode("");
      await onVerified();
    } catch {
      setError("The authenticator code could not be verified. Check the code and try again.");
    } finally {
      setLoading(false);
    }
  };

  return <div className="page-content inner-page">
    <div className="admin-mfa-card">
      <ShieldCheck size={25} />
      <span className="eyebrow">ADMINISTRATOR VERIFICATION</span>
      <h2>Verify your authenticator</h2>
      <p>A server-assigned administrator role is present, but this session must reach MFA assurance level AAL2 before the workspace can open.</p>
      {factorLoading ? <p>Checking enrolled authenticator…</p> : !factorId && !qrCode
        ? <button className="primary-button" type="button" disabled={loading || Boolean(error)} onClick={enrollAuthenticator}>{loading ? "Preparing…" : "Set up an authenticator"}</button>
        : <>
          {qrCode && <div className="mfa-enrollment"><Image src={qrCode} width={180} height={180} unoptimized alt="QR code for authenticator setup" /><p>Scan this code with an authenticator app, then enter its current six-digit code.</p><label>Setup key<input readOnly type="text" value={secret ?? ""} /></label></div>}
          <form className="admin-mfa-form" onSubmit={verifyCode}>
            <label htmlFor="admin-totp-code">Authenticator code</label>
            <input id="admin-totp-code" value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required />
            <button className="primary-button" type="submit" disabled={loading || code.trim().length !== 6}>{loading ? "Verifying…" : "Verify and continue"}</button>
          </form>
        </>}
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="admin-mfa-note"><ShieldCheck size={15} /> AAL2 is checked again by the server for every administrative action.</div>
    </div>
  </div>;
}

function AdminConsole() {
  const [tab, setTab] = useState("Vendor review");
  return <div className="page-content inner-page admin-page">
    <div className="admin-warning"><ShieldCheck size={16} /><span><strong>Administrator access verified.</strong> Supabase Auth role claims, MFA and server-side policies protect administrator data and decisions. Metrics and payment, dispute, and audit views are not yet connected.</span></div>
    <div className="vendor-welcome"><div><span className="eyebrow">PLATFORM ADMINISTRATION</span><h1>Platform overview</h1><p>Manage real vendor applications; other platform data views are not connected yet.</p></div><span className="admin-tag"><ShieldCheck size={14} /> MFA verified</span></div>
    <div className="vendor-tabs">{["Overview", "Vendor review", "Orders", "Payments", "Disputes", "Audit logs"].map((item) => <button key={item} className={tab === item ? "current" : ""} onClick={() => setTab(item)}>{item}</button>)}</div>
    {tab === "Overview" && <div className="admin-overview-grid">
      <div className="integration-card"><div className="integration-icon"><FileCheck2 size={22} /></div><span className="eyebrow">CONNECTED ADMIN WORKFLOW</span><h3>Vendor applications</h3><p>Review submitted applications through an MFA-protected live queue. Identity verification and approval still require a configured verification provider.</p><button className="primary-button" onClick={() => setTab("Vendor review")}>Open vendor review <ArrowRight size={15} /></button></div>
      <div className="admin-side-card"><h3>Live data status</h3><p>Unconnected figures are intentionally not represented as real activity.</p><div className="health-row"><span><i className="health-light" />Vendor review</span><StatusPill>Connected</StatusPill></div><div className="health-row"><span><i className="health-light" />Orders & sales</span><StatusPill tone="gray">Not connected</StatusPill></div><div className="health-row"><span><i className="health-light" />Payments</span><StatusPill tone="gray">Not connected</StatusPill></div><div className="health-row"><span><i className="health-light" />Audit logs</span><StatusPill tone="gray">Not connected</StatusPill></div></div>
    </div>}
    {tab === "Vendor review" && <AdminVendorQueue />}
    {["Orders", "Payments", "Disputes", "Audit logs"].includes(tab) && <div className="integration-card"><div className="integration-icon"><FileCheck2 size={22} /></div><span className="eyebrow">LIVE DATA VIEW NOT CONNECTED</span><h3>{tab}</h3><p>This data view is unavailable until an authorized, audited server-side query is implemented. No sample records are shown as live platform data.</p><StatusPill tone="gray">Unavailable</StatusPill></div>}
  </div>;
}

function AdminVendorQueue() {
  const [applications, setApplications] = useState<AdminApplication[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [decision, setDecision] = useState<"rejected" | "request_information" | "manual_review" | "approved">("request_information");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshCounter, setRefreshCounter] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      setError("");
      try {
        const response = await fetch(`/api/admin/vendors?page=${page}`, { cache: "no-store" });
        const result = await response.json() as { applications?: unknown; total?: number; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Vendor applications could not be loaded.");
        const parsed = adminApplicationsSchema.safeParse(result.applications);
        if (!parsed.success) throw new Error("The vendor queue returned invalid data.");
        const parsedTotal = z.number().int().nonnegative().safeParse(result.total);
        if (!parsedTotal.success) throw new Error("The vendor queue returned an invalid total.");
        if (active) {
          setApplications(parsed.data);
          setTotal(parsedTotal.data);
        }
      } catch (loadError) {
        if (active) {
          setApplications(null);
          setError(loadError instanceof Error ? loadError.message : "Vendor applications could not be loaded.");
        }
      }
    })();
    return () => { active = false; };
  }, [page, refreshCounter]);

  const submitReview = async (event: FormEvent<HTMLFormElement>, application: AdminApplication) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const reason = String(form.get("reason") ?? "").trim();
    const vendorMessage = String(form.get("vendorMessage") ?? "").trim();
    setBusyId(application.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/vendors/${application.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reason, ...(vendorMessage ? { vendorMessage } : {}) }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The decision could not be recorded.");
      setNotice("The vendor decision was recorded and added to the audit trail.");
      setSelectedId(null);
      if (applications?.length === 1 && page > 1) setPage((current) => current - 1);
      else setRefreshCounter((count) => count + 1);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The decision could not be recorded.");
    } finally {
      setBusyId(null);
    }
  };

  const startReview = async (application: AdminApplication) => {
    setBusyId(application.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/vendors/${application.id}/review`, { method: "POST" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The application could not be moved into review.");
      setNotice("Review started. Add a decision and reason when your review is complete.");
      setRefreshCounter((count) => count + 1);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "The application could not be moved into review.");
    } finally {
      setBusyId(null);
    }
  };

  return <div className="table-card admin-vendor-queue">
    <div className="table-header"><div><h3>Vendor applications</h3><p>{applications ? `${total} application${total === 1 ? "" : "s"} awaiting action` : "Protected live queue · identity records are not exposed here"}</p></div><button className="outline-button" onClick={() => setRefreshCounter((count) => count + 1)}>Refresh</button></div>
    {error && <div className="admin-action-error" role="alert">{error}</div>}
    {notice && <div className="admin-action-notice" role="status">{notice}</div>}
    {applications === null && !error ? <div className="small-empty">Loading protected applications…</div>
      : total === 0 ? <div className="small-empty"><CheckCircle2 size={19} /><span>No vendor applications currently need review.</span></div>
        : applications && <div className="table-scroll"><table><thead><tr><th>BUSINESS</th><th>TYPE & CATEGORY</th><th>LOCATION</th><th>APPLICATION</th><th>VERIFICATION</th><th>ACTION</th></tr></thead><tbody>{applications.map((application) => {
          const selected = selectedId === application.id;
          const isBusy = busyId === application.id;
          const canApprove = application.verification_status === "approved";
          const statusLabel = (value: string) => value.replaceAll("_", " ");
          return <Fragment key={application.id}>
            <tr><td><strong>{application.business_name}</strong><small>{application.business_role}</small></td><td>{application.business_type === "registered_business" ? "Registered business" : "Individual"}<small>{application.categories?.name ?? "Uncategorized"}</small></td><td>{application.location}<small>{application.region}</small></td><td><StatusPill tone={application.application_status === "under_review" ? "amber" : "gray"}>{statusLabel(application.application_status)}</StatusPill><small>{new Date(application.created_at).toLocaleDateString()}</small></td><td><StatusPill tone={application.verification_status === "approved" ? "green" : "amber"}>{statusLabel(application.verification_status)}</StatusPill></td><td>{application.application_status === "submitted"
              ? <button className="primary-button" disabled={busyId !== null} onClick={() => void startReview(application)}>{isBusy ? "Starting…" : "Start review"}</button>
              : application.application_status === "under_review"
                ? <button className="text-link" disabled={busyId !== null && !isBusy} onClick={() => { setSelectedId(selected ? null : application.id); setDecision(canApprove ? "approved" : "request_information"); }}>{selected ? "Close" : "Review"}</button>
                : <span className="fulfilment-label">Awaiting vendor</span>}</td></tr>
            {selected && application.application_status === "under_review" && <tr className="admin-review-detail"><td colSpan={6}>
              <div className="admin-application-detail"><div><span className="eyebrow">APPLICATION DETAILS</span><p><strong>Role:</strong> {application.business_role}</p><p><strong>Updated:</strong> {new Date(application.updated_at).toLocaleString()}</p>{application.action_required_message && <p><strong>Previous next steps:</strong> {application.action_required_message}</p>}</div>
              <form className="admin-decision-form" onSubmit={(event) => void submitReview(event, application)}>
                <label>Decision<select value={decision} onChange={(event) => setDecision(event.target.value as typeof decision)}><option value="request_information">Request information</option><option value="manual_review">Manual review</option><option value="rejected">Reject application</option>{canApprove && <option value="approved">Approve verified vendor</option>}</select></label>
                <label>Internal review reason<textarea name="reason" minLength={8} maxLength={1000} required placeholder="Record the reason for this decision." /></label>
                {decision === "request_information" || decision === "rejected" ? <label>Vendor-facing next steps<textarea name="vendorMessage" minLength={8} maxLength={1000} required placeholder="Explain clearly what the vendor should do next." /></label> : <label>Vendor-facing note (optional)<textarea name="vendorMessage" maxLength={1000} placeholder="Optional note for the vendor." /></label>}
                <button className="primary-button" type="submit" disabled={isBusy}>{isBusy ? "Saving…" : "Record decision"}</button>
              </form></div>
            </td></tr>}
          </Fragment>;
        })}</tbody></table></div>}
    {total > 50 && <div className="admin-pagination"><span>Showing {(page - 1) * 50 + 1}–{Math.min(page * 50, total)} of {total}</span><div><button className="outline-button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button><button className="outline-button" disabled={page * 50 >= total} onClick={() => setPage((current) => current + 1)}>Next</button></div></div>}
    <div className="guest-note"><ShieldCheck size={15} /><span>Identity records are not displayed. Approval is enabled only after a trusted provider verification; every decision requires a reason and is audit logged.</span></div>
  </div>;
}

function Storefront({ addToCart, openChat }: { addToCart: (id: string) => void; openChat: () => void }) {
  return <div className="page-content storefront-page">
    <div className="store-cover"><div className="store-cover-photo" /><div className="store-brand-mark">A</div><button className="outline-button" onClick={openChat}><MessageCircle size={16} /> Chat with seller</button></div>
    <div className="store-info"><div><div className="store-name-line"><h1>Asaase Collective</h1><BadgeCheck size={19} fill="#13844c" color="#13844c" /></div><p>Handcrafted treasures, woven with heritage. Every piece tells a story of home.</p><div className="store-facts"><span><MapPin size={14} /> Accra, Greater Accra</span><span><span className="rating">★ 4.9</span> <small>(128 reviews)</small></span><span><Package size={14} /> 36 thoughtful finds</span></div></div><div className="store-since"><span>ON MARKETLINK SINCE</span><strong>September 2024</strong></div></div>
    <div className="store-notice"><BadgeCheck size={16} /><span>This is a preview storefront. Store details and products shown are sample content.</span></div>
    <div className="store-catalog-heading"><div><span className="eyebrow">THE COLLECTION</span><h2>Made with meaning</h2></div><button className="filter-button"><SlidersHorizontal size={15} /> Filter & sort</button></div>
    <div className="product-grid">{initialProducts.filter((item) => item.store === "Asaase Collective").map((product) => <ProductCard key={product.id} product={product} addToCart={addToCart} saved={false} toggleSaved={() => undefined} onStore={() => undefined} />)}</div>
    <div className="store-policy"><div><Truck size={17} /><strong>Delivery</strong><span>Accra delivery within 2–4 days</span></div><div><FileText size={17} /><strong>Returns</strong><span>7-day returns on eligible items</span></div><div><MessageCircle size={17} /><strong>Questions?</strong><button onClick={openChat}>Contact the seller</button></div></div>
  </div>;
}

function Metric({ label, value, change, icon: Icon }: { label: string; value: string; change: string; icon: LucideIcon }) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={17} /></span></div><div className="metric-value">{value}</div><div className={`metric-change ${change === "Needs attention" ? "amber-text" : ""}`}><ArrowUpRight size={13} />{change}<span>{change !== "Needs attention" && " vs last week"}</span></div></div>;
}
function PageTitle({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return <div className="page-title"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div>;
}

function CheckoutModal({ items, subtotal, updateQuantity, close, submit, liveCatalog, submitting }: { items: (Product & { qty: number })[]; subtotal: number; updateQuantity: (id: string, amount: number) => void; close: () => void; submit: (event: FormEvent<HTMLFormElement>) => void; liveCatalog: boolean; submitting: boolean }) {
  const [stage, setStage] = useState<"bag" | "checkout">(items.length === 0 ? "bag" : "checkout");
  return <div className="dialog checkout-dialog"><div className="dialog-top"><div><span className="eyebrow">{stage === "bag" ? "YOUR MARKETLINK BAG" : liveCatalog ? "MTN MOMO SANDBOX CHECKOUT" : "DEMO CHECKOUT"}</span><h2>{stage === "bag" ? "Your bag" : "Almost yours."}</h2></div><button className="icon-button" onClick={close} disabled={submitting} aria-label="Close"><X size={19} /></button></div>
    {items.length === 0 ? <div className="empty-state checkout-empty"><ShoppingBag size={25} /><h3>Your bag is taking a little break</h3><p>Explore the marketplace and add a few local favourites.</p><button className="primary-button" onClick={close}>Continue shopping <ArrowRight size={15} /></button></div> :
      stage === "bag" ? <><div className="checkout-items">{items.map((item) => <CheckoutItem key={item.id} item={item} updateQuantity={updateQuantity} />)}</div><div className="checkout-summary"><span>Subtotal <strong>{money(subtotal)}</strong></span><small>Delivery fees are confirmed by each vendor.</small></div><button className="primary-button full-button" onClick={() => setStage("checkout")}>Continue to checkout <ArrowRight size={15} /></button><button className="back-link" onClick={() => setStage("bag")}><ArrowLeft size={14} /> Review bag</button></> :
      <form className="checkout-form" onSubmit={submit}><div className="checkout-items compact-items">{items.map((item) => <CheckoutItem key={item.id} item={item} updateQuantity={updateQuantity} />)}</div><div className="checkout-summary"><span>Subtotal <strong>{money(subtotal)}</strong></span><small>Delivery fees are confirmed by each vendor.</small></div><div className="form-grid"><label>Full name<input name="buyerName" required placeholder="e.g. Akosua Mensah" /></label><label>Email address<input name="email" type="email" required placeholder="you@example.com" /></label><label>Phone number<input name="phone" type="tel" required placeholder="+233 24 000 0000" /></label><label>Region<select name="region" required defaultValue="Greater Accra"><option>Greater Accra</option><option>Ashanti</option><option>Central</option><option>Eastern</option><option>Western</option><option>Other</option></select></label><label className="full-field">Delivery address<input name="address" required placeholder="Street, area and delivery notes" /></label></div><div className="sandbox-payment"><ShieldCheck size={16} /><span>{liveCatalog ? "MTN MoMo sandbox: your phone will receive an approval prompt. Sandbox payments are not real money." : "Demo only: orders stay in this browser and no payment is collected."}</span></div><button className="primary-button full-button" type="submit" disabled={submitting}>{submitting ? "Creating order…" : liveCatalog ? `Place order with MTN MoMo · ${money(subtotal)}` : `Place demo order · ${money(subtotal)}`} <ArrowRight size={15} /></button><p className="guest-checkout-note"><LockSmall /> No account needed. Create one after checkout to keep track of your order.</p></form>}
  </div>;
}
function CheckoutItem({ item, updateQuantity }: { item: Product & { qty: number }; updateQuantity: (id: string, amount: number) => void }) {
  return <div className="checkout-item"><div className="checkout-thumb" style={{ backgroundImage: `url("${imageUrl(item.image)}")` }} /><div className="checkout-item-copy"><strong>{item.name}</strong><small>{item.store}</small><b>{money(item.price)}</b></div><div className="quantity-control"><button type="button" onClick={() => updateQuantity(item.id, -1)} aria-label="Remove one item">−</button><span>{item.qty}</span><button type="button" onClick={() => updateQuantity(item.id, 1)} aria-label="Add one item">+</button></div></div>;
}
function LockSmall() { return <ShieldCheck size={14} />; }

function OnboardingModal({ step, setStep, close, submit }: { step: number; setStep: (step: number) => void; close: () => void; submit: () => void }) {
  const [businessType, setBusinessType] = useState<"Individual" | "Registered business">("Individual");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [sandboxConsent, setSandboxConsent] = useState(false);
  const steps = ["Account", "Business", "Identity", "Liveness"];
  const form = useForm<OnboardingValues>({ resolver: zodResolver(onboardingSchema), defaultValues: { businessType: "Individual", terms: false, region: "", category: "" } });
  const next = async () => {
    if (step === 1) {
      const valid = await form.trigger(["fullName", "email", "phone", "password", "terms"]);
      if (!valid) return;
      setEmail(form.getValues("email"));
      setName(form.getValues("fullName"));
      setStep(2);
    } else if (step === 2) {
      const valid = await form.trigger(["businessName", "category", "region", "location", "businessRole"]);
      if (valid) setStep(3);
    } else if (step === 3) setStep(4);
    else if (sandboxConsent) submit();
  };
  return <div className="dialog onboarding-dialog"><div className="dialog-top"><div><span className="eyebrow">VENDOR APPLICATION</span><h2>Bring your craft to MarketLink</h2></div><button className="icon-button" onClick={close} aria-label="Close"><X size={19} /></button></div><div className="stepper">{steps.map((label, index) => <div key={label} className={`stepper-item ${step > index + 1 ? "done" : ""} ${step === index + 1 ? "active" : ""}`}><span>{step > index + 1 ? <Check size={13} /> : index + 1}</span><small>{label}</small></div>)}</div>
    {step === 1 && <div className="onboarding-panel"><div className="sandbox-callout"><Sparkles size={17} /><span><strong>Sandbox walkthrough.</strong> Use synthetic information only. No account is created and no email is sent.</span></div><p className="onboarding-intro">First, tell us who you are. Your details help keep the MarketLink community trusted.</p><div className="form-grid"><label>Full legal name<input {...form.register("fullName")} placeholder="e.g. Akosua Mensah" autoComplete="name" />{form.formState.errors.fullName && <small className="field-error">{form.formState.errors.fullName.message}</small>}</label><label>Email address<input {...form.register("email")} type="email" placeholder="you@example.com" autoComplete="email" />{form.formState.errors.email && <small className="field-error">{form.formState.errors.email.message}</small>}</label><label>Phone number<input {...form.register("phone")} type="tel" placeholder="+233 24 000 0000" autoComplete="tel" />{form.formState.errors.phone && <small className="field-error">{form.formState.errors.phone.message}</small>}</label><label>Password<input {...form.register("password")} type="password" placeholder="At least 8 characters" autoComplete="new-password" />{form.formState.errors.password && <small className="field-error">{form.formState.errors.password.message}</small>}</label></div><label className="checkbox-label"><input type="checkbox" {...form.register("terms")} /><span>I agree to the <a href="#terms">Terms of Service</a> and <a href="#privacy">Privacy Policy</a>.</span></label>{form.formState.errors.terms && <small className="field-error">{form.formState.errors.terms.message}</small>}<div className="sandbox-payment email-demo"><ShieldCheck size={16} /><span>{email ? `Email verification is a production step. A verification link would be sent to ${email}.` : "Email verification is required before a real vendor application can be submitted."}</span></div></div>}
    {step === 2 && <div className="onboarding-panel"><p className="onboarding-intro">{name ? `Thanks, ${name.split(" ")[0]}. ` : ""}Tell us a little about the business you’re building.</p><div className="choice-toggle"><button className={businessType === "Individual" ? "chosen" : ""} onClick={() => { setBusinessType("Individual"); form.setValue("businessType", "Individual"); }}>Individual vendor</button><button className={businessType === "Registered business" ? "chosen" : ""} onClick={() => { setBusinessType("Registered business"); form.setValue("businessType", "Registered business"); }}>Registered business</button></div><div className="form-grid"><label>Business / trading name<input {...form.register("businessName")} placeholder="e.g. Akosua’s Market" />{form.formState.errors.businessName && <small className="field-error">{form.formState.errors.businessName.message}</small>}</label><label>Business category<select {...form.register("category")} defaultValue=""><option value="" disabled>Select category</option><option>Fashion & accessories</option><option>Beauty & wellness</option><option>Home & living</option><option>Food & drink</option><option>Arts & crafts</option><option>Other</option></select>{form.formState.errors.category && <small className="field-error">{form.formState.errors.category.message}</small>}</label><label>Region<select {...form.register("region")} defaultValue=""><option value="" disabled>Select region</option>{["Greater Accra", "Ashanti", "Central", "Eastern", "Western", "Western North", "Volta", "Oti", "Northern", "Savannah", "North East", "Upper East", "Upper West", "Bono", "Bono East", "Ahafo"].map((region) => <option key={region}>{region}</option>)}</select>{form.formState.errors.region && <small className="field-error">{form.formState.errors.region.message}</small>}</label><label>Town / area<input {...form.register("location")} placeholder="e.g. Osu, Accra" />{form.formState.errors.location && <small className="field-error">{form.formState.errors.location.message}</small>}</label><label className="full-field">Your role in the business<input {...form.register("businessRole")} placeholder="e.g. Owner, founder, authorized manager" /></label>{businessType === "Registered business" && <label className="full-field">Business registration number <span className="optional-label">Optional for demo</span><input {...form.register("registrationNumber")} placeholder="Enter registration number" /></label>}</div><div className="sandbox-payment"><FileText size={16} /><span>Company registration documents are not required for individual vendors unless the verification policy requires them.</span></div></div>}
    {step === 3 && <div className="onboarding-panel"><p className="onboarding-intro">Identity checks help protect buyers and honest sellers. Real documents should only be collected through an approved, secure provider.</p><div className="sandbox-callout warning-callout"><ShieldCheck size={18} /><span><strong>No real ID uploads in this sandbox.</strong> This demo does not collect identity documents, selfies or biometric data.</span></div><div className="document-card"><span className="document-icon"><FileCheck2 size={19} /></span><div><strong>Choose your identity document</strong><p>Ghana Card, passport or another provider-supported document.</p><small>Accepted formats and file size limits are set by the chosen provider.</small></div><span className="not-connected">Provider required</span></div><div className="upload-placeholder"><Plus size={20} /><strong>Secure document submission unavailable</strong><span>Provider-hosted capture and private storage must be configured before real document collection.</span></div><div className="upload-status"><span><Clock3 size={15} /> Verification status</span><StatusPill tone="gray">Not started</StatusPill></div><p className="retry-note">Resubmission, upload progress and manual review are enabled only through a configured identity provider.</p></div>}
    {step === 4 && <div className="onboarding-panel"><p className="onboarding-intro">A supported provider can check that a real person is present and match their face to their identity document.</p><div className="sandbox-callout warning-callout"><ShieldCheck size={18} /><span><strong>Live facial verification is not connected.</strong> This sandbox never opens your camera, compares images or marks a person as verified.</span></div><div className="liveness-benefits"><span><CheckCircle2 size={17} /> Provider-hosted liveness detection</span><span><CheckCircle2 size={17} /> Document-to-face matching, where supported</span><span><CheckCircle2 size={17} /> Accessibility alternative and manual review route</span><span><CheckCircle2 size={17} /> Clear camera permission and failure handling</span></div><label className="checkbox-label consent-check"><input type="checkbox" checked={sandboxConsent} onChange={(event) => setSandboxConsent(event.target.checked)} /><span>I understand a real biometric check requires a configured provider and my explicit consent. This sandbox submits only synthetic application state.</span></label></div>}
    <div className="dialog-footer"><button className="back-link" onClick={() => step > 1 ? setStep(step - 1) : close()}><ArrowLeft size={14} /> {step === 1 ? "Cancel" : "Back"}</button><span>Step {step} of 4</span><button className="primary-button" onClick={next} disabled={step === 4 && !sandboxConsent}>{step === 4 ? "Submit demo application" : "Continue"} <ArrowRight size={15} /></button></div>
  </div>;
}

function ProductForm({ close, save }: { close: () => void; save: (product: Omit<Product, "id" | "store" | "rating">) => void }) {
  const schema = z.object({ name: z.string().min(2), category: z.string().min(1), price: z.coerce.number().positive(), stock: z.coerce.number().int().min(0).max(100000), sku: z.string().max(80), image: z.string() });
  const { register, handleSubmit, formState: { errors } } = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { category: "Fashion", image: "photo-1542291026-7eec264c27ff", stock: 1, sku: "" } });
  return <form className="product-form" onSubmit={handleSubmit((values) => save({ ...values, sku: values.sku || undefined }))}><p>Product creation is available in this local sandbox.</p><label>Product name<input {...register("name")} placeholder="e.g. Handwoven market basket" />{errors.name && <small className="field-error">Enter a product name.</small>}</label><label>Category<select {...register("category")}><option>Fashion</option><option>Beauty</option><option>Home</option><option>Food & drink</option><option>Arts & crafts</option></select></label><label>Price (GH₵)<input {...register("price")} type="number" min="0.01" step="0.01" placeholder="0.00" />{errors.price && <small className="field-error">Enter a valid price.</small>}</label><label>Stock quantity<input {...register("stock")} type="number" min="0" step="1" /></label><label>SKU <span className="optional-label">Optional</span><input {...register("sku")} placeholder="e.g. KENTE-001" /></label><div className="dialog-footer"><button type="button" className="back-link" onClick={close}>Cancel</button><button className="primary-button" type="submit"><Plus size={15} /> Save product</button></div></form>;
}

function AuthModal({ close }: { close: () => void }) {
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    try {
      const supabase = createSupabaseBrowserClient();
      if (mode === "sign_up") {
        const fullName = String(data.get("fullName") ?? "").trim();
        const phone = String(data.get("phone") ?? "").trim();
        const { error: signupError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName, phone },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (signupError) throw signupError;
        setMessage("Check your email for a verification link to finish creating your account.");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        close();
        window.location.reload();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Authentication could not be completed.");
    } finally {
      setLoading(false);
    }
  };

  return <div className="dialog auth-dialog"><div className="dialog-top"><div><span className="eyebrow">{mode === "sign_in" ? "WELCOME BACK" : "JOIN MARKETLINK"}</span><h2>{mode === "sign_in" ? "Good things start here." : "Let’s make it yours."}</h2></div><button className="icon-button" onClick={close} aria-label="Close"><X size={19} /></button></div>
    <p>{mode === "sign_in" ? "Sign in to keep your orders and favourite local makers close." : "Create an account to check out faster and keep up with your orders."}</p>
    <form className="product-form" onSubmit={submit}>
      {mode === "sign_up" && <><label>Full name<input name="fullName" autoComplete="name" required minLength={3} maxLength={160} placeholder="Your full name" /></label><label>Phone number<input name="phone" type="tel" autoComplete="tel" required minLength={9} maxLength={30} placeholder="+233 24 000 0000" /></label></>}
      <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" /></label>
      <label>Password<input name="password" type="password" autoComplete={mode === "sign_in" ? "current-password" : "new-password"} required minLength={8} maxLength={128} placeholder="At least 8 characters" /></label>
      {mode === "sign_up" && <label className="checkbox-label"><input name="terms" type="checkbox" required /><span>I agree to the <a href="#terms">Terms of Service</a> and <a href="#privacy">Privacy Policy</a>.</span></label>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      {message && <p className="auth-success" role="status">{message}</p>}
      <button className="primary-button full-button" disabled={loading} type="submit">{loading ? "Please wait…" : mode === "sign_in" ? <><LogIn size={16} /> Sign in</> : "Create account"}</button>
    </form>
    <button className="auth-switch" onClick={() => { setMode(mode === "sign_in" ? "sign_up" : "sign_in"); setError(""); setMessage(""); }}>{mode === "sign_in" ? "New to MarketLink? Create an account" : "Already have an account? Sign in"}</button>
    <div className="secure-note"><ShieldCheck size={15} />Admin permissions are never assigned during public sign-up.</div>
  </div>;
}
