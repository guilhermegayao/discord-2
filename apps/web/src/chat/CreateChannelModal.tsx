import {
  type CreateChannelData,
  type CreateChannelInput,
  createChannelSchema,
} from '@discord-2/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { applyServerErrors } from '../auth/serverErrors';
import { FormField } from '../components/FormField';
import { Modal } from '../components/Modal';
import { useCreateChannel } from './hooks';

interface Props {
  guildId: string;
  onClose: () => void;
}

export function CreateChannelModal({ guildId, onClose }: Props) {
  const navigate = useNavigate();
  const createChannel = useCreateChannel(guildId);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateChannelInput, unknown, CreateChannelData>({
    resolver: zodResolver(createChannelSchema),
  });

  const onSubmit = handleSubmit(async (data) => {
    try {
      const channel = await createChannel.mutateAsync(data);
      onClose();
      // Canal de texto abre; canal de voz só aparece na lista (entrar é um clique a mais).
      if (channel.type === 'TEXT') await navigate(`/channels/${guildId}/${channel.id}`);
    } catch (err) {
      applyServerErrors(err, setError);
    }
  });

  return (
    <Modal title="Criar canal" onClose={onClose}>
      <form className="modal__form" onSubmit={(e) => void onSubmit(e)} noValidate>
        <fieldset className="channel-type">
          <legend>Tipo do canal</legend>
          <label>
            <input type="radio" value="TEXT" defaultChecked {...register('type')} /> # Texto
          </label>
          <label>
            <input type="radio" value="VOICE" {...register('type')} /> 🔊 Voz
          </label>
        </fieldset>
        <FormField
          label="Nome do canal"
          placeholder="novo-canal"
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
            Criar canal
          </button>
        </div>
      </form>
    </Modal>
  );
}
