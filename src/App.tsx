import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";
import Loading from "./pages/Loading";
import CuremedHome from "./pages/CuremedHome";
import BrandPage from "./pages/BrandPage";
import ProductDetail from "./pages/ProductDetail";
import CategoryPage from "./pages/CategoryPage";
import AboutUs from "./pages/AboutUs";
import ContactUs from "./pages/ContactUs";
import NotFound from "./pages/NotFound";
import { AdminLayout } from "@/components/admin/AdminLayout";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminOverview from "./pages/admin/AdminOverview";
import AdminProducts from "./pages/admin/AdminProducts";
import AdminProductEditor from "./pages/admin/AdminProductEditor";
import AdminCategories from "./pages/admin/AdminCategories";
import AdminMessages from "./pages/admin/AdminMessages";
import AdminSubscribers from "./pages/admin/AdminSubscribers";
import AdminLandingPages from "./pages/admin/AdminLandingPages";
import AdminLandingPageEditor from "./pages/admin/AdminLandingPageEditor";
import AdminModels from "./pages/admin/AdminModels";
import AdminTags from "./pages/admin/AdminTags";
import AdminFlags from "./pages/admin/AdminFlags";
import AdminReviews from "./pages/admin/AdminReviews";
import AdminOrders from "./pages/admin/AdminOrders";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import OrderConfirmation from "./pages/OrderConfirmation";
import { CartProvider } from "@/lib/cart";

const queryClient = new QueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          <CartProvider>
            <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Loading />} />
                <Route path="/curemed" element={<CuremedHome />} />
                <Route path="/about" element={<AboutUs />} />
                <Route path="/contact" element={<ContactUs />} />
                <Route path="/cart" element={<Cart />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/order-confirmation/:id" element={<OrderConfirmation />} />
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
                </Route>
                <Route path="/category/:slug" element={<CategoryPage />} />
                <Route path="/:brand/product/:id" element={<ProductDetail />} />
                <Route path="/:brand" element={<BrandPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
            </TooltipProvider>
          </CartProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
