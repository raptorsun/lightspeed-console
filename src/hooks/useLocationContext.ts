import * as React from 'react';
import { useLocation } from 'react-router-dom';

const resources = {
  pods: 'Pod',
  deployments: 'Deployment',
  statefulsets: 'StatefulSet',
  cronjobs: 'CronJob',
  jobs: 'Job',
  daemonsets: 'DaemonSet',
  replicasets: 'ReplicaSet',
  horizontalpodautoscalers: 'HorizontalPodAutoscaler',
  poddisruptionbudgets: 'PodDisruptionBudget',

  // Networking
  services: 'Service',
  routes: 'Route',
  ingresses: 'Ingress',
  networkpolicies: 'NetworkPolicy',

  // Virtualization
  'kubevirt.io~v1~VirtualMachine': 'kubevirt.io~v1~VirtualMachine',
  'kubevirt.io~v1~VirtualMachineInstance': 'kubevirt.io~v1~VirtualMachineInstance',
  'kubevirt.io~v1~VirtualMachineInstanceMigration':
    'kubevirt.io~v1~VirtualMachineInstanceMigration',
  'instancetype.kubevirt.io~v1beta1~VirtualMachineClusterInstancetype':
    'instancetype.kubevirt.io~v1beta1~VirtualMachineClusterInstancetype',
  'instancetype.kubevirt.io~v1beta1~VirtualMachineClusterPreference':
    'instancetype.kubevirt.io~v1beta1~VirtualMachineClusterPreference',
  'cdi.kubevirt.io~v1beta1~DataSource': 'cdi.kubevirt.io~v1beta1~DataSource',
  'migrations.kubevirt.io~v1alpha1~MigrationPolicy':
    'migrations.kubevirt.io~v1alpha1~MigrationPolicy',
  templates: 'Template',
};

export const useLocationContext = () => {
  const [kind, setKind] = React.useState<string>();
  const [name, setName] = React.useState<string>();
  const [namespace, setNamespace] = React.useState<string>();

  const location = useLocation();
  const path = location?.pathname;

  React.useEffect(() => {
    if (path) {
      const ns = `[a-z0-9-]+`;
      const resourceType = Object.keys(resources).join('|');
      const resourceName = '[a-z0-9-.]+';

      let matches = undefined;
      matches = path.match(new RegExp(`/k8s/ns/(${ns})/(${resourceType})/(${resourceName})`));
      if (matches) {
        setKind(resources[matches[2]]);
        setName(matches[3]);
        setNamespace(matches[1]);
        return;
      }

      matches = path.match(new RegExp(`/k8s/all-namespaces/(${resourceType})/(${resourceName})`));
      if (matches) {
        setKind(resources[matches[1]]);
        setName(matches[2]);
        setNamespace(undefined);
        return;
      }

      matches = path.match(new RegExp(`/k8s/cluster/(${resourceType})/(${resourceName})`));
      if (matches) {
        setKind(resources[matches[1]]);
        setName(matches[2]);
        setNamespace(undefined);
        return;
      }

      if (new RegExp('^/monitoring/alerts/[0-9]+').test(path)) {
        const params = new URLSearchParams(location.search);
        if (params.has('alertname')) {
          setKind('Alert');
          setName(params.get('alertname'));
          setNamespace(params.get('namespace'));
          return;
        }
      }

      setKind(undefined);
      setName(undefined);
      setNamespace(undefined);
    }
  }, [location.search, path]);

  return [kind, name, namespace];
};
