import { AccountsRepository } from "@modules/accounts/accounts.repository";
import { WelcomeService } from "@modules/accounts/welcome.service";
import { Module } from "@nestjs/common";

@Module({
  providers: [AccountsRepository, WelcomeService],
  exports: [AccountsRepository, WelcomeService],
})
export class AccountsModule {}
