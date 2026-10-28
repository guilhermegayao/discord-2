import { type LoginData, type LoginInput, loginSchema } from '@discord-2/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { redirectTarget } from '../auth/redirect';
import { applyServerErrors } from '../auth/serverErrors';
import { FormField } from '../components/FormField';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = redirectTarget(location.state);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput, unknown, LoginData>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (data) => {
    try {
      await login(data);
      await navigate(from, { replace: true });
    } catch (err) {
      applyServerErrors(err, setError);
    }
  });

  return (
    <main className="auth">
      <form className="card" onSubmit={(e) => void onSubmit(e)} noValidate>
        <h1>Boas-vindas de volta!</h1>
        <p className="muted">Entre para continuar.</p>

        <FormField
          label="E-mail"
          type="email"
          autoComplete="email"
          registration={register('email')}
          error={errors.email}
        />
        <FormField
          label="Senha"
          type="password"
          autoComplete="current-password"
          registration={register('password')}
          error={errors.password}
        />

        {errors.root?.server && (
          <p className="form-error" role="alert">
            {errors.root.server.message}
          </p>
        )}

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Entrando…' : 'Entrar'}
        </button>
        <p className="muted">
          Não tem conta?{' '}
          <Link to="/register" state={location.state as unknown}>
            Cadastre-se
          </Link>
        </p>
      </form>
    </main>
  );
}
