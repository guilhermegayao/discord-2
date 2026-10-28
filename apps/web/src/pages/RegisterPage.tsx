import { type RegisterData, type RegisterInput, registerSchema } from '@discord-2/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { redirectTarget } from '../auth/redirect';
import { applyServerErrors } from '../auth/serverErrors';
import { FormField } from '../components/FormField';

export function RegisterPage() {
  const { register: signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = redirectTarget(location.state);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput, unknown, RegisterData>({ resolver: zodResolver(registerSchema) });

  const onSubmit = handleSubmit(async (data) => {
    try {
      await signUp(data);
      await navigate(from, { replace: true });
    } catch (err) {
      applyServerErrors(err, setError);
    }
  });

  return (
    <main className="auth">
      <form className="card" onSubmit={(e) => void onSubmit(e)} noValidate>
        <h1>Criar conta</h1>

        <FormField
          label="E-mail"
          type="email"
          autoComplete="email"
          registration={register('email')}
          error={errors.email}
        />
        <FormField
          label="Nome de exibição"
          autoComplete="nickname"
          registration={register('displayName')}
          error={errors.displayName}
        />
        <FormField
          label="Nome de usuário"
          autoComplete="username"
          registration={register('username')}
          error={errors.username}
        />
        <FormField
          label="Senha"
          type="password"
          autoComplete="new-password"
          registration={register('password')}
          error={errors.password}
        />

        {errors.root?.server && (
          <p className="form-error" role="alert">
            {errors.root.server.message}
          </p>
        )}

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Criando…' : 'Criar conta'}
        </button>
        <p className="muted">
          Já tem conta?{' '}
          <Link to="/login" state={location.state as unknown}>
            Entrar
          </Link>
        </p>
      </form>
    </main>
  );
}
