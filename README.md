# docker-registry-cleanup-action
This action deletes a specific tag from a docker registry.
Currently only v2 registries with token auth are supported.

## Usage

```yml
    - id: cleanup
      uses: SamhammerAG/docker-registry-cleanup-action@v1
      with:
        registry: https://myregistry.com
        registry_path: projectName/appName
        registry_user: myUser
        registry_password: ${{ secrets.MY_REGISTRY_PASSWORD }}
        tag: 1.0.5
        ignoreNotFound: true
```

## Config

### Action inputs

| Name | Description | Default |
| --- | --- | --- |
| `registry` | The url to the registry including protocol (registry with valid cert required) | `` |
| `registry_path` | The path to the docker images | "" |
| `registry_user` | The registry username | "" |
| `registry_password` | The registry password | "" |
| `tag` | The name of the tag | "" |
| `ignoreNotFound` | (Optional) If set to "true" the action does not fail if the tag does not exists | "false" |
