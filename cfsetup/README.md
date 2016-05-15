# Workshop infrastructure setup

This directory contains CloudFormation templates to create network and other infrastructure (`stack-infra-network`) as well as the workstation EC2 instance we use in the workshops (`stack-workstation`). The workshop can be completed without these if participants use their own device to interface with AWS. The workstation instance defined here helps to set up things like AWS credentials so that workshop participants can just connect to the instance and start hacking away.

The stacks are specified in YAML instead of the regular JSON but adhere to the same format. We use our own [AWS Utils](https://github.com/NitorCreations/aws-utils) to author CloudFormation templates using YAML and added features like build time stack references for faster feedback. The YAML stacks can be built to a deployable JSON using the Nitor AWS Utils.
