#!/bin/bash -xe

CF_AWS__StackName="workstation"
CF_AWS__Region="eu-west-1"
CF_paramDnsName="work.serverless.rocks"
CF_paramAwsUtilsVersion="0.82"
CF_paramAmi=""
CF_paramAmiName=""
CF_paramEip=""
CF_paramEBSTag="serverless-work-home"
CF_paramEBSSize="50"
export HOME=/root
cd $HOME

source /opt/nitor/cloud_init_functions.sh
source /opt/nitor/tool_installers.sh
AWSUTILS_VERSION="${CF_paramAwsUtilsVersion}" update_aws_utils
# reload scripts sourced above in case they changed:
source /opt/nitor/cloud_init_functions.sh
source /opt/nitor/tool_installers.sh
source /opt/nitor/ebs-functions.sh
source /opt/nitor/aws_tools.sh

fail () {
    echo "$@"
    exit 1
}

install_workstation () {
  mv /home/centos /tmp

  bash -x /usr/bin/volume-from-snapshot.sh ${CF_paramEBSTag} ${CF_paramEBSTag} /home ${CF_paramEBSSize}
  cat > /etc/cron.d/home-snapshot << MARKER
30 * * * * root /usr/bin/snapshot-from-volume.sh ${CF_paramEBSTag} ${CF_paramEBSTag} /home >> /var/log/snapshot.log
MARKER

  rm -rf /home/centos
  mv /tmp/centos /home
  restorecon -Rv /home/
  mkdir /etc/skel/.aws/
  chmod 700 /etc/skel/.aws/
  base64 --decode < /root/credentials.encrypted > /root/credentials.encrypted.bin
  aws kms decrypt --ciphertext-blob fileb:///root/credentials.encrypted.bin --output text --query Plaintext | base64 --decode > /etc/skel/.aws/credentials
  chmod 600 /etc/skel/.aws/credentials
  cat > /etc/skel/.aws/config << MARKER
[default]
output = json
region = $CF_AWS__Region
MARKER
  chmod 600 /etc/skel/.aws/config
  for username in teamred teamyellow teamblue teamorange teampurple teamgreen teamamber \
    teamcrimson teamcyan teamgray teamblack teammaroon teamolive teampink teamteal; do
      useradd -m $username
      echo -n "$username:"
      dd if=/dev/urandom bs=100 count=1 status=none | tr -cd '[:alnum:]' | cut -c -10
  done > /root/users
  cat /root/users | chpasswd
}

set_region
aws_install_metadata_files
set_timezone
set_hostname

install_workstation

aws_ec2_associate_address

source /opt/nitor/cloud_init_footer.sh
