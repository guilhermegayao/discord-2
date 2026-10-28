import { type CreateGuildData, type CreateGuildInput, createGuildSchema } from '@discord-2/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { applyServerErrors } from '../auth/serverErrors';
import { FormField } from '../components/FormField';
import { Modal } from '../components/Modal';
import { useCreateGuild } from './hooks';

export function CreateGuildModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const createGuild = useCreateGuild();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateGuildInput, unknown, CreateGuildData>({
    resolver: zodResolver(createGuildSchema),
  });

  const onSubmit = handleSubmit(async (data) => {
    try {
      const guild = await createGuild.mutateAsync(data);
      onClose();
      await navigate(`/channels/${guild.id}/${guild.channels[0]?.id ?? ''}`);
    } catch (err) {
      applyServerErrors(err, setError);
    }
  });

  return (
    <Modal title="Criar servidor" onClose={onClose}>
      <form className="modal__form" onSubmit={(e) => void onSubmit(e)} noValidate>
        <FormField
          label="Nome do servidor"
          autoFocus
          registration={register('name')}
          error={errors.name}
        />
        {errors.root?.server && (
          <p className="form-error" role="alert">
            {errors.root.server.message}
          </p>
        )}
        <div className="modal__actions">
          <button type="button" className="button--secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" disabled={isSubmitting}>
            Criar
          </button>
        </div>
      </form>
    </Modal>
  );
}
