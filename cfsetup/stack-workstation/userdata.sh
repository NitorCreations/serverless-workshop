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

decrypt() {
  base64 --decode < $1 > $1.bin
  aws kms decrypt --ciphertext-blob fileb://$1.bin --output text --query Plaintext | base64 --decode > $2
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
  decrypt /root/credentials.encrypted /etc/skel/.aws/credentials
  if [ -r /root/ssh-hostkeys.encrypted ]; then
    decrypt /root/ssh-hostkeys.encrypted /root/ssh-hostkeys.sh.gz
    gunzip /root/ssh-hostkeys.sh.gz
    chmod 750 /root/ssh-hostkeys.sh
    /root/ssh-hostkeys.sh
    rm -rf /root/ssh-hostkeys.sh
  fi
  sed -i 's/^PasswordAuthentication.*/PasswordAuthentication yes/g' /etc/ssh/sshd_config
  systemctl restart sshd
  chmod 600 /etc/skel/.aws/credentials
  cat > /etc/skel/.aws/config << MARKER
[default]
output = json
region = $CF_AWS__Region
MARKER
  chmod 600 /etc/skel/.aws/config
  for username in teamred teamyellow teamblue teamorange teampurple teamgreen teamamber teamwhite \
    teamcrimson teamcyan teamgray teamblack teammaroon teamolive teampink teamteal teambrown; do
      rm -rf /home/$username
      useradd -m $username
      echo -n "$username:"
      dd if=/dev/urandom bs=100 count=1 status=none | tr -cd '[:alnum:]' | cut -c -10
  done > /root/users
  cat /root/users | chpasswd
  wget -O /tmp/verot_2011.csv https://www.vero.fi/download/Julkiset_nettiin_CSV/%7B934080C4-4EB2-466A-8642-26217CD15B29%7D/7951
  wget -O /tmp/verot_2012.csv https://www.vero.fi/download/Yhteisojen_tuloverotuksen_julkiset_tiedot_2012_kuntanumerot_005999/%7B236F0CD0-4072-47ED-8A7A-0F2B8C4E9691%7D/8808
  wget -O /tmp/verot_2013.csv https://www.vero.fi/download/Julkiset_nettiin_CSV__2013/%7B3AD7359B-6888-4168-A78C-545DB20612F3%7D/10029
  wget -O /tmp/verot_2014.csv https://www.vero.fi/download/Julkiset_nettiin_CSV_2014/%7B6786C0AA-EECE-479F-AF1B-213DC3A91ABD%7D/11209
}

set_region
aws_install_metadata_files
set_timezone
set_hostname

install_workstation

aws_ec2_associate_address

source /opt/nitor/cloud_init_footer.sh
