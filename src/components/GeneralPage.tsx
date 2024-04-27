import { List as ImmutableList, Map as ImmutableMap } from 'immutable';
import { dump } from 'js-yaml';
import { cloneDeep, defer } from 'lodash';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import {
  consoleFetchJSON,
  K8sResourceKind,
  ResourceIcon,
  useK8sWatchResource,
} from '@openshift-console/dynamic-plugin-sdk';
import {
  Alert,
  Button,
  Chip,
  ChipGroup,
  Form,
  HelperText,
  HelperTextItem,
  Icon,
  Label,
  Level,
  LevelItem,
  MenuToggle,
  Page,
  PageSection,
  Select,
  SelectList,
  SelectOption,
  Spinner,
  Split,
  SplitItem,
  TextArea,
  Title,
  Tooltip,
} from '@patternfly/react-core';
import {
  CompressIcon,
  ExpandIcon,
  ExternalLinkAltIcon,
  FileCodeIcon,
  PaperPlaneIcon,
  PlusCircleIcon,
  TimesIcon,
} from '@patternfly/react-icons';

import { AuthStatus, getRequestInitwithAuthHeader, useAuth } from '../hooks/useAuth';
import { useBoolean } from '../hooks/useBoolean';
import { useLocationContext } from '../hooks/useLocationContext';
import {
  attachmentAdd,
  attachmentDelete,
  attachmentsClear,
  chatHistoryClear,
  chatHistoryPush,
  setContext,
  setConversationID,
  setQuery,
} from '../redux-actions';
import { State } from '../redux-reducers';
import { Attachment, ChatEntry, ReferencedDoc } from '../types';
import Feedback from './Feedback';

import './general-page.css';

const QUERY_ENDPOINT = '/api/proxy/plugin/lightspeed-console-plugin/ols/v1/query';

const REQUEST_TIMEOUT = 10 * 60 * 1000; // 10 minutes

type QueryResponse = {
  conversation_id: string;
  query: string;
  referenced_documents: Array<ReferencedDoc>;
  response: string;
  truncated: boolean;
};

type ExternalLinkProps = {
  children: React.ReactNode;
  href: string;
};

const ExternalLink: React.FC<ExternalLinkProps> = ({ children, href }) => (
  <a href={href} target="_blank" rel="noopener noreferrer">
    {children} <ExternalLinkAltIcon />
  </a>
);

type DocLinkProps = {
  reference: ReferencedDoc;
};

const DocLink: React.FC<DocLinkProps> = ({ reference }) => {
  if (!reference || typeof reference.docs_url !== 'string' || typeof reference.title !== 'string') {
    return null;
  }

  return (
    <Chip isReadOnly textMaxWidth="16rem">
      <ExternalLink href={reference.docs_url}>{reference.title}</ExternalLink>
    </Chip>
  );
};

type ChatHistoryEntryProps = {
  conversationID: string;
  entry: ChatEntry;
  entryIndex: number;
  scrollIntoView: () => void;
};

const ChatHistoryEntry: React.FC<ChatHistoryEntryProps> = ({
  conversationID,
  entry,
  entryIndex,
  scrollIntoView,
}) => {
  const { t } = useTranslation('plugin__lightspeed-console-plugin');

  if (entry.who === 'ai') {
    return (
      <div className="ols-plugin__chat-entry ols-plugin__chat-entry--ai">
        <div className="ols-plugin__chat-entry-name">OpenShift Lightspeed</div>
        {entry.error ? (
          <Alert isInline title={t('Error submitting query')} variant="danger">
            {entry.error}
          </Alert>
        ) : (
          <>
            <div className="ols-plugin__chat-entry-text">{entry.text}</div>
            {entry.isTruncated && (
              <Alert isInline title={t('History truncated')} variant="warning">
                {t('Conversation history has been truncated to fit within context window.')}
              </Alert>
            )}
            {entry.references && (
              <ChipGroup categoryName="Referenced docs" className="ols-plugin__references">
                {entry.references.map((r, i) => (
                  <DocLink reference={r} key={i} />
                ))}
              </ChipGroup>
            )}
            <Feedback
              conversationID={conversationID}
              entryIndex={entryIndex}
              scrollIntoView={scrollIntoView}
            />
          </>
        )}
      </div>
    );
  }
  if (entry.who === 'user') {
    return (
      <div className="ols-plugin__chat-entry ols-plugin__chat-entry--user">
        <div className="ols-plugin__chat-entry-name">You</div>
        <div className="ols-plugin__chat-entry-text">{entry.text}</div>
      </div>
    );
  }
  return null;
};

const ChatHistoryEntryWaiting = () => (
  <div className="ols-plugin__chat-entry ols-plugin__chat-entry--ai">
    <div className="ols-plugin__chat-entry-name">OpenShift Lightspeed</div>
    <Spinner size="lg" />
  </div>
);

type AuthAlertProps = {
  authStatus: AuthStatus;
};

const AuthAlert: React.FC<AuthAlertProps> = ({ authStatus }) => {
  const { t } = useTranslation('plugin__lightspeed-console-plugin');

  if (authStatus === AuthStatus.NotAuthenticated) {
    return (
      <Alert className="ols-plugin__alert" isInline title={t('Not authenticated')} variant="danger">
        {t(
          'OpenShift Lightspeed authentication failed. Contact your system administrator for more information.',
        )}
      </Alert>
    );
  }

  if (authStatus === AuthStatus.NotAuthorized) {
    return (
      <Alert className="ols-plugin__alert" isInline title={t('Not authorized')} variant="danger">
        {t(
          'You do not have sufficient permissions to access OpenShift Lightspeed. Contact your system administrator for more information.',
        )}
      </Alert>
    );
  }

  return null;
};

const PrivacyAlert: React.FC = () => {
  const { t } = useTranslation('plugin__lightspeed-console-plugin');

  return (
    <Alert className="ols-plugin__alert" isInline title={t('Important')} variant="info">
      {t(
        'OpenShift Lightspeed can answer questions related to OpenShift. Do not include personal or business sensitive information in your input. Interactions with OpenShift Lightspeed may be reviewed and used to improve our products and services.',
      )}
    </Alert>
  );
};

const Welcome: React.FC = () => {
  const { t } = useTranslation('plugin__lightspeed-console-plugin');

  return (
    <>
      <div className="ols-plugin__welcome-logo"></div>
      <Title className="pf-v5-u-text-align-center" headingLevel="h1">
        {t('Red Hat OpenShift Lightspeed')}
      </Title>
      <Title className="ols-plugin__welcome-subheading pf-v5-u-text-align-center" headingLevel="h4">
        {t(
          'Explore deeper insights, engage in meaningful discussions, and unlock new possibilities with Red Hat OpenShift Lightspeed. Answers are provided by generative AI technology, please use appropriate caution when following recommendations.',
        )}
      </Title>
    </>
  );
};

enum AttachmentTypes {
  YAML = 'YAML',
  YAMLStatus = 'YAML Status',
}

type AttachMenuProps = {
  context: K8sResourceKind;
};

const getAttachmentID = (attachmentType: string, kind: string, name: string): string =>
  `${attachmentType}_${kind}_${name}`;

const AttachMenu: React.FC<AttachMenuProps> = ({ context }) => {
  const { t } = useTranslation('plugin__lightspeed-console-plugin');

  const dispatch = useDispatch();

  const attachments = useSelector((s: State) => s.plugins?.ols?.get('attachments'));

  const [error, setError] = React.useState<string>();
  const [isOpen, setIsOpen] = React.useState(false);

  const onToggleClick = React.useCallback(() => {
    setIsOpen(!isOpen);
  }, [isOpen]);

  const kind = context?.kind;
  const name = context?.metadata?.name;
  const namespace = context?.metadata?.namespace;

  const onSelect = React.useCallback(
    (_e: React.MouseEvent | undefined, attachmentType: string) => {
      const id = getAttachmentID(attachmentType, kind, name);
      if (attachments.has(id)) {
        dispatch(attachmentDelete(id));
      } else {
        let data;
        if (attachmentType === AttachmentTypes.YAML) {
          data = cloneDeep(context);
          delete data.metadata.managedFields;
        } else if (attachmentType === AttachmentTypes.YAMLStatus) {
          data = { status: context.status };
        }
        try {
          const yaml = dump(data, { lineWidth: -1 }).trim();
          dispatch(attachmentAdd(attachmentType, kind, name, namespace, yaml));
        } catch (e) {
          setError(t('Error getting YAML: {{e}}', { e }));
        }
      }
    },
    [attachments, context, dispatch, kind, name, namespace, t],
  );

  if (!kind || !name) {
    return null;
  }

  return (
    <>
      {error && (
        <Alert
          className="ols-plugin__alert"
          isInline
          title={t('Failed to attach context')}
          variant="danger"
        >
          {error}
        </Alert>
      )}

      <Select
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        onSelect={onSelect}
        toggle={(toggleRef) => (
          <Tooltip content={t('Attach context')} position="left">
            <MenuToggle
              className="ols-plugin__attach-menu"
              isExpanded={isOpen}
              onClick={onToggleClick}
              ref={toggleRef}
              variant="plain"
            >
              <Icon size="lg">
                <PlusCircleIcon />
              </Icon>
            </MenuToggle>
          </Tooltip>
        )}
      >
        <SelectList className="ols-plugin__context-menu">
          <Title className="ols-plugin__context-menu-heading" headingLevel="h5">
            {t('Currently viewing')}
          </Title>
          <Label
            className="ols-plugin__context-label"
            textMaxWidth="10rem"
            title={t('{{kind}} {{name}} in namespace {{namespace}}', { kind, name, namespace })}
          >
            <ResourceIcon kind={kind} /> {name}
          </Label>

          <Title className="ols-plugin__context-menu-heading" headingLevel="h5">
            {t('Attach')}
          </Title>
          <SelectOption
            isSelected={attachments.has(getAttachmentID(AttachmentTypes.YAML, kind, name))}
            value={AttachmentTypes.YAML}
          >
            <FileCodeIcon /> YAML
          </SelectOption>
          <SelectOption
            isSelected={attachments.has(getAttachmentID(AttachmentTypes.YAMLStatus, kind, name))}
            value={AttachmentTypes.YAMLStatus}
          >
            <FileCodeIcon /> YAML <Chip isReadOnly>status</Chip> only
          </SelectOption>
        </SelectList>
      </Select>
    </>
  );
};

const buildQuery = (query: string, attachments: ImmutableMap<string, Attachment>): string => {
  let fullQuery = query;

  attachments.forEach((attachment: Attachment) => {
    if (attachment.attachmentType === AttachmentTypes.YAML) {
      fullQuery += `

For reference, here is the full resource YAML for ${attachment.kind} '${attachment.name}':
\`\`\`yaml
${attachment.value}
\`\`\``;
    }

    if (attachment.attachmentType === AttachmentTypes.YAMLStatus) {
      fullQuery += `

For reference, here is the resource's 'status' section YAML for ${attachment.kind} '${attachment.name}':
\`\`\`yaml
${attachment.value}
\`\`\``;
    }
  });

  return fullQuery;
};

type GeneralPageProps = {
  onClose: () => void;
  onCollapse?: () => void;
  onExpand?: () => void;
};

const GeneralPage: React.FC<GeneralPageProps> = ({ onClose, onCollapse, onExpand }) => {
  const { t } = useTranslation('plugin__lightspeed-console-plugin');

  const dispatch = useDispatch();

  const attachments = useSelector((s: State) => s.plugins?.ols?.get('attachments'));
  const chatHistory: ImmutableList<ChatEntry> = useSelector((s: State) =>
    s.plugins?.ols?.get('chatHistory'),
  );
  const context: K8sResourceKind = useSelector((s: State) => s.plugins?.ols?.get('context'));

  // Do we have a context that looks like a k8s resource with sufficient information
  const isK8sResourceContext =
    context &&
    typeof context.kind === 'string' &&
    typeof context.metadata?.name === 'string' &&
    typeof context.metadata?.namespace === 'string';

  const [selectedContext] = useK8sWatchResource<K8sResourceKind>(
    isK8sResourceContext
      ? {
          isList: false,
          kind: context.kind,
          name: context.metadata?.name,
          namespace: context.metadata?.namespace,
        }
      : null,
  );

  const conversationID: string = useSelector((s: State) => s.plugins?.ols?.get('conversationID'));
  const query: string = useSelector((s: State) => s.plugins?.ols?.get('query'));

  const [validated, setValidated] = React.useState<'default' | 'error'>('default');

  const [pageContext] = useLocationContext();

  const [authStatus] = useAuth();

  const attachContext = pageContext || selectedContext;

  const [isWaiting, , setWaiting, unsetWaiting] = useBoolean(false);

  const chatHistoryEndRef = React.useRef(null);
  const promptRef = React.useRef(null);

  const scrollIntoView = React.useCallback((behavior = 'smooth') => {
    defer(() => {
      chatHistoryEndRef?.current?.scrollIntoView({ behavior });
    });
  }, []);

  // Scroll to bottom of chat after first render (when opening UI that already has chat history)
  React.useEffect(() => {
    scrollIntoView('instant');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearChat = React.useCallback(() => {
    dispatch(setContext(null));
    dispatch(setConversationID(null));
    dispatch(chatHistoryClear());
    dispatch(attachmentsClear());
  }, [dispatch]);

  const onChange = React.useCallback(
    (_e, value) => {
      if (value.trim().length > 0) {
        setValidated('default');
      }
      dispatch(setQuery(value));
    },
    [dispatch],
  );

  const onSubmit = React.useCallback(
    (e) => {
      e.preventDefault();

      if (!query || query.trim().length === 0) {
        setValidated('error');
        return;
      }

      dispatch(chatHistoryPush({ attachments, text: query, who: 'user' }));
      scrollIntoView();
      setWaiting();

      const requestJSON = {
        conversation_id: conversationID,
        query: buildQuery(query, attachments),
      };

      consoleFetchJSON
        .post(QUERY_ENDPOINT, requestJSON, getRequestInitwithAuthHeader(), REQUEST_TIMEOUT)
        .then((response: QueryResponse) => {
          dispatch(setConversationID(response.conversation_id));
          dispatch(
            chatHistoryPush({
              isTruncated: response.truncated === true,
              references: response.referenced_documents,
              text: response.response,
              who: 'ai',
            }),
          );
          scrollIntoView();
          unsetWaiting();
        })
        .catch((error) => {
          const errorMessage = error.json?.detail || error.message || 'Query POST failed';
          dispatch(chatHistoryPush({ error: errorMessage, isTruncated: false, who: 'ai' }));
          scrollIntoView();
          unsetWaiting();
        });

      // Clear prompt input and return focus to it
      dispatch(setQuery(''));
      dispatch(attachmentsClear());
      promptRef.current?.focus();
    },
    [attachments, conversationID, dispatch, query, scrollIntoView, setWaiting, unsetWaiting],
  );

  const onKeyDown = React.useCallback(
    (e) => {
      // Enter key alone submits the prompt, Shift+Enter inserts a newline
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSubmit(e);
      }
    },
    [onSubmit],
  );

  const isWelcomePage = chatHistory.size === 0;

  return (
    <>
      <Page>
        <PageSection className={isWelcomePage ? undefined : 'ols-plugin__header'} variant="light">
          <TimesIcon className="ols-plugin__popover-close" onClick={onClose} />
          {onExpand && <ExpandIcon className="ols-plugin__popover-close" onClick={onExpand} />}
          {onCollapse && (
            <CompressIcon className="ols-plugin__popover-close" onClick={onCollapse} />
          )}
          {!isWelcomePage && (
            <Level>
              <LevelItem>
                <Title className="ols-plugin__heading" headingLevel="h1">
                  {t('Red Hat OpenShift Lightspeed')}
                </Title>
              </LevelItem>
              <LevelItem>
                <Button onClick={clearChat} variant="primary">
                  {t('New chat')}
                </Button>
              </LevelItem>
            </Level>
          )}
        </PageSection>

        <PageSection
          aria-label={t('OpenShift Lightspeed chat history')}
          className="ols-plugin__chat-history"
          hasOverflowScroll
          isFilled
          variant="light"
        >
          {isWelcomePage && <Welcome />}
          <AuthAlert authStatus={authStatus} />
          <PrivacyAlert />
          {chatHistory.toJS().map((entry, i) => (
            <ChatHistoryEntry
              key={i}
              conversationID={conversationID}
              entry={entry}
              entryIndex={i}
              scrollIntoView={scrollIntoView}
            />
          ))}
          {isWaiting && <ChatHistoryEntryWaiting />}
          <div ref={chatHistoryEndRef} />
        </PageSection>

        {authStatus !== AuthStatus.NotAuthenticated && authStatus !== AuthStatus.NotAuthorized && (
          <PageSection className="ols-plugin__chat-prompt" isFilled={false} variant="light">
            <Form onSubmit={onSubmit}>
              <Split hasGutter>
                <SplitItem>{attachContext && <AttachMenu context={attachContext} />}</SplitItem>
                <SplitItem isFilled>
                  <TextArea
                    aria-label={t('OpenShift Lightspeed prompt')}
                    autoFocus
                    className="ols-plugin__chat-prompt-input"
                    onChange={onChange}
                    onKeyDown={onKeyDown}
                    onFocus={(e) => {
                      // Move cursor to the end of the text when popover is closed then reopened
                      const len = e.currentTarget?.value?.length;
                      if (len) {
                        e.currentTarget.setSelectionRange(len, len);
                      }
                    }}
                    placeholder={t('Send a message...')}
                    ref={promptRef}
                    resizeOrientation="vertical"
                    rows={Math.min(query.split('\n').length, 12)}
                    validated={validated}
                    value={query}
                  />
                  <>
                    {attachments.keySeq().map((id: string) => {
                      const attachment: Attachment = attachments.get(id);
                      if (!attachment) {
                        return null;
                      }
                      return (
                        <Label
                          className="ols-plugin__context-label"
                          key={id}
                          onClose={() => dispatch(attachmentDelete(id))}
                          textMaxWidth="16rem"
                          title={t('{{kind}} {{name}} in namespace {{namespace}}', {
                            kind: attachment.kind,
                            name: attachment.name,
                            namespace: attachment.namespace,
                          })}
                        >
                          <ResourceIcon kind={attachment.kind} /> {attachment.name}{' '}
                          <Label>{attachment.attachmentType}</Label>
                        </Label>
                      );
                    })}
                  </>
                </SplitItem>
                <SplitItem className="ols-plugin__chat-prompt-submit">
                  <Button
                    className="ols-plugin__chat-prompt-button"
                    type="submit"
                    variant="primary"
                  >
                    <PaperPlaneIcon />
                  </Button>
                </SplitItem>
              </Split>
            </Form>

            <HelperText>
              <HelperTextItem className="ols-plugin__footer" variant="indeterminate">
                {t('Always check AI/LLM generated responses for accuracy prior to use.')}
              </HelperTextItem>
            </HelperText>
          </PageSection>
        )}
      </Page>
    </>
  );
};

export default GeneralPage;
