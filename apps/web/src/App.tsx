import type { ReactElement } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import Login from './pages/Login';
import AcceptInvitation from './pages/AcceptInvitation';
import Home from './pages/Home';
import Passkeys from './pages/Passkeys';
import CourseList from './pages/CourseList';
import CourseNew from './pages/CourseNew';
import CourseDetail from './pages/CourseDetail';

function RequireAuth({ children }: { children: ReactElement }) {
  const { state } = useAuth();
  if (state.status === 'loading') return <p>読み込み中...</p>;
  if (state.status === 'unauthenticated') return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/invitations/:token" element={<AcceptInvitation />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Home />
              </RequireAuth>
            }
          />
          <Route
            path="/passkeys"
            element={
              <RequireAuth>
                <Passkeys />
              </RequireAuth>
            }
          />
          <Route
            path="/courses"
            element={
              <RequireAuth>
                <CourseList />
              </RequireAuth>
            }
          />
          <Route
            path="/courses/new"
            element={
              <RequireAuth>
                <CourseNew />
              </RequireAuth>
            }
          />
          <Route
            path="/courses/:id"
            element={
              <RequireAuth>
                <CourseDetail />
              </RequireAuth>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
