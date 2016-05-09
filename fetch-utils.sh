#!/bin/bash

mkdir -p aws-utils
wget -q -O - https://github.com/NitorCreations/aws-utils/archive/master.tar.gz | tar -xzvf - --strip 3 -C aws-utils
