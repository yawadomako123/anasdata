import { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import Home from './pages/Home.jsx';
import Bundles from './pages/Bundles.jsx';
import Checkout from './pages/Checkout.jsx';
import Success from './pages/Success.jsx';
import TrackOrder from './pages/TrackOrder.jsx';
import AdminLogin from './pages/admin/AdminLogin.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import AdminBundles from './pages/admin/AdminBundles.jsx';
import RequireAuth from './pages/admin/RequireAuth.jsx';

export default function App() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');

  // Reset scroll to the top whenever the route changes (SPA navigation
  // otherwise keeps the previous page's scroll position).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="app">
      {!isAdmin && <Navbar />}
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/bundles" element={<Bundles />} />
          <Route path="/checkout/:bundleId" element={<Checkout />} />
          <Route path="/success" element={<Success />} />
          <Route path="/track" element={<TrackOrder />} />

          <Route path="/admin/login" element={<AdminLogin />} />
          <Route
            path="/admin"
            element={
              <RequireAuth>
                <AdminDashboard />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/bundles"
            element={
              <RequireAuth>
                <AdminBundles />
              </RequireAuth>
            }
          />

          <Route path="*" element={<Home />} />
        </Routes>
      </main>
      {!isAdmin && <Footer />}
    </div>
  );
}
