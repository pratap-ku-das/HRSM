# Permanent EC2 deployment

OrbitHR deploys from GitHub Actions through AWS Systems Manager. It does not use SSH, a PEM key, or the developer public IP.

## Flow

1. A push to main runs tests and builds the web app.
2. GitHub obtains short-lived AWS credentials with OIDC.
3. The release is uploaded to a private encrypted S3 bucket.
4. SSM tells EC2 to install dependencies and run Prisma migrations.
5. The app path switches atomically and orbithr.service restarts.
6. A failed health check restores the previous app release.

The production .env remains on EC2 at:

    /home/ec2-user/orbithr-shared/.env

## One-time AWS setup

1. Create a private S3 bucket in eu-north-1 with public access blocked.
2. Attach an EC2 IAM role containing AmazonSSMManagedInstanceCore and S3 GetObject for the deployment bucket.
3. Confirm the instance appears in Systems Manager Fleet Manager.
4. Add token.actions.githubusercontent.com as an IAM OIDC provider with audience sts.amazonaws.com.
5. Create a GitHub deploy role restricted to:
   repo:pratap-ku-das/HRSM:environment:production
6. Allow that role S3 PutObject and DeleteObject, plus SSM SendCommand and GetCommandInvocation for this instance.

Create the GitHub environment production and repository variables:

- AWS_REGION
- AWS_DEPLOY_ROLE_ARN
- DEPLOY_BUCKET
- EC2_INSTANCE_ID

Run Deploy production once from GitHub Actions. After it succeeds, remove inbound TCP port 22 from the EC2 security group. Keep ports 80 and 443.

Future pushes to main deploy automatically. Database migrations are forward-only and are not reversed during an application rollback.
