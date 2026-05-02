import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";
import Loading from "./pages/Loading";
import { BrandingHead } from "@/components/site/BrandingHead";
import { CartProvider } from "@/lib/cart";
import { AuthProvider } from "@/lib/auth";

/* ---- Lazy-loaded pages ---- */
const CuremedHome = lazy(() => import("./pages/CuremedHome"));
const BrandPage = lazy(() => import("./pages/BrandPage"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const CategoryPage = lazy(() => import("./pages/CategoryPage"));
const AboutUs = lazy(() => import("./pages/AboutUs"));
const ContactUs = lazy(() => import("./pages/ContactUs"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Cart = lazy(() => import("./pages/Cart"));
const Checkout = lazy(() => import("./pages/Checkout"));
const OrderConfirmation = lazy(() => import("./pages/OrderConfirmation"));
const Auth = lazy(() => import("./pages/Auth"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Account = lazy(() => import("./pages/Account"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));

/* Admin */
const AdminLayout = lazy(() => import("@/components/admin/AdminLayout").then(m => ({ default: m.AdminLayout })));
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const AdminOverview = lazy(() => import("./pages/admin/AdminOverview"));
const AdminProducts = lazy(() => import("./pages/admin/AdminProducts"));
const AdminProductEditor = lazy(() => import("./pages/admin/AdminProductEditor"));
const AdminCategories = lazy(() => import("./pages/admin/AdminCategories"));
const AdminMessages = lazy(() => import("./pages/admin/AdminMessages"));
const AdminSubscribers = lazy(() => import("./pages/admin/AdminSubscribers"));
const AdminLandingPages = lazy(() => import("./pages/admin/AdminLandingPages"));
const AdminLandingPageEditor = lazy(() => import("./pages/admin/AdminLandingPageEditor"));
const AdminModels = lazy(() => import("./pages/admin/AdminModels"));
const AdminTags = lazy(() => import("./pages/admin/AdminTags"));
const AdminFlags = lazy(() => import("./pages/admin/AdminFlags"));
const AdminReviews = lazy(() => import("./pages/admin/AdminReviews"));
const AdminOrders = lazy(() => import("./pages/admin/AdminOrders"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminCoupons = lazy(() => import("./pages/admin/AdminCoupons"));
const AdminNotificationTemplates = lazy(() => import("./pages/admin/AdminNotificationTemplates"));
const AdminBranding = lazy(() => import("./pages/admin/AdminBranding"));

const PageFallback = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
);

const queryClient = new QueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          <AuthProvider>
            <CartProvider>
            <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrandingHead />
            <BrowserRouter>
              <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<Loading />} />
                <Route path="/curemed" element={<CuremedHome />} />
                <Route path="/about" element={<AboutUs />} />
                <Route path="/contact" element={<ContactUs />} />
                <Route path="/cart" element={<Cart />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/order-confirmation/:id" element={<OrderConfirmation />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/account" element={<Account />} />
                <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                <Route path="/terms-of-service" element={<TermsOfService />} />
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminOverview />} />
                  <Route path="products" element={<AdminProducts />} />
                  <Route path="products/new" element={<AdminProductEditor />} />
                  <Route path="products/:id" element={<AdminProductEditor />} />
                  <Route path="categories" element={<AdminCategories />} />
                  <Route path="tags" element={<AdminTags />} />
                  <Route path="landing" element={<AdminLandingPageEditor />} />
                  <Route path="landing/all" element={<AdminLandingPages />} />
                  <Route path="landing/:pageKey" element={<AdminLandingPageEditor />} />
                  <Route path="models" element={<AdminModels />} />
                  <Route path="messages" element={<AdminMessages />} />
                  <Route path="subscribers" element={<AdminSubscribers />} />
                  <Route path="flags" element={<AdminFlags />} />
                  <Route path="reviews" element={<AdminReviews />} />
                  <Route path="orders" element={<AdminOrders />} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route path="coupons" element={<AdminCoupons />} />
                  <Route path="notifications" element={<AdminNotificationTemplates />} />
                  <Route path="branding" element={<AdminBranding />} />
                </Route>
                <Route path="/category/:slug" element={<CategoryPage />} />
                <Route path="/:brand/product/:id" element={<ProductDetail />} />
                <Route path="/:brand" element={<BrandPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
              </Suspense>
            </BrowserRouter>
            </TooltipProvider>
            </CartProvider>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
