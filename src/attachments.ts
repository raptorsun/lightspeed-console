import { Attachment } from './types';

export enum AttachmentTypes {
  Events = 'Events',
  Log = 'Log',
  YAML = 'YAML',
  YAMLFiltered = 'YAML filtered',
  YAMLUpload = 'YAMLUpload',
}

export const isAttachmentChanged = (attachment: Attachment): boolean =>
  attachment?.originalValue !== undefined && attachment.originalValue !== attachment.value;

/* eslint-disable camelcase */
export const toOLSAttachment = (attachment: Attachment) => {
  let attachment_type = 'api object';
  if (attachment.attachmentType === AttachmentTypes.Events) {
    attachment_type = 'event';
  }
  if (attachment.attachmentType === AttachmentTypes.Log) {
    attachment_type = 'log';
  }

  return {
    attachment_type,
    content: attachment.value,
    content_type:
      attachment.attachmentType === AttachmentTypes.Log ? 'text/plain' : 'application/yaml',
  };
};
/* eslint-enable camelcase */
