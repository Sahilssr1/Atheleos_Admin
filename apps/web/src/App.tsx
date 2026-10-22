import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, ProtectedRoute, RequirePermission } from './auth/AuthContext';
import { ToastProvider } from './components/Toast';
import AppLayout from './layout/AppLayout';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Overview from './pages/Overview';
import Users from './pages/Users';
import UserDetail from './pages/UserDetail';
import Verifications from './pages/Verifications';
import Content from './pages/Content';
import Comments from './pages/Comments';
import Stories from './pages/Stories';
import Moderation from './pages/Moderation';
import Reports from './pages/Reports';
import Messages from './pages/Messages';
import Email from './pages/Email';
import Notifications from './pages/Notifications';
import Support from './pages/Support';
import Analytics from './pages/Analytics';
import Admins from './pages/Admins';
import Roles from './pages/Roles';
import Audit from './pages/Audit';
import Settings from './pages/Settings';
import Security from './pages/Security';
import Health from './pages/Health';
import SearchPage from './pages/SearchPage';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route index element={<RequirePermission permission="dashboard.view"><Overview /></RequirePermission>} />
            <Route path="users" element={<RequirePermission permission="users.view"><Users /></RequirePermission>} />
            <Route path="users/:id" element={<RequirePermission permission="users.view"><UserDetail /></RequirePermission>} />
            <Route path="verifications" element={<RequirePermission permission="users.verify"><Verifications /></RequirePermission>} />
            <Route path="content" element={<RequirePermission permission="content.view"><Content /></RequirePermission>} />
            <Route path="comments" element={<RequirePermission permission="content.view"><Comments /></RequirePermission>} />
            <Route path="stories" element={<RequirePermission permission="content.view"><Stories /></RequirePermission>} />
            <Route path="moderation" element={<RequirePermission permission="moderation.view"><Moderation /></RequirePermission>} />
            <Route path="reports" element={<RequirePermission permission="reports.view"><Reports /></RequirePermission>} />
            <Route path="messages" element={<RequirePermission permission="messages.view"><Messages /></RequirePermission>} />
            <Route path="email" element={<RequirePermission permission="email.view"><Email /></RequirePermission>} />
            <Route path="notifications" element={<RequirePermission permission="notifications.view"><Notifications /></RequirePermission>} />
            <Route path="support" element={<RequirePermission permission="support.view"><Support /></RequirePermission>} />
            <Route path="analytics" element={<RequirePermission permission="analytics.view"><Analytics /></RequirePermission>} />
            <Route path="admins" element={<RequirePermission permission="admins.manage"><Admins /></RequirePermission>} />
            <Route path="roles" element={<RequirePermission permission="roles.manage"><Roles /></RequirePermission>} />
            <Route path="audit" element={<RequirePermission permission="audit.view"><Audit /></RequirePermission>} />
            <Route path="settings" element={<RequirePermission permission="settings.manage"><Settings /></RequirePermission>} />
            <Route path="security" element={<RequirePermission permission="security.view"><Security /></RequirePermission>} />
            <Route path="health" element={<RequirePermission permission="system.view"><Health /></RequirePermission>} />
            <Route path="search" element={<SearchPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
